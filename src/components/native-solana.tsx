'use client';
import { useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { useRentalWallet } from '@/wallets';
import type { SolanaOperation } from '@/server/solana-service';
import type { SolanaSnapshot } from '@/server/solana-rpc';
import { parseAmount, displayAmount } from '@/domain/assets';
import { Badge, money } from './workspace-panels';

type Operation = Omit<SolanaOperation, 'signedTxBase64' | 'subject' | 'fingerprint'>;
type Observation = SolanaSnapshot & {
  available: true;
  cluster: 'devnet' | 'localnet';
  walletChain: 'solana:devnet' | null;
  agreementId: string;
  role: 'tenant' | 'landlord' | 'arbitrator';
  walletId: string;
  feePayer: string;
  operations: Operation[];
};
type Action =
  | { kind: 'fund' | 'settle' }
  | {
      kind: 'supply' | 'release_earnings' | 'propose_claim' | 'resolve_claim';
      amountAtomic: string;
    }
  | { kind: 'respond_to_claim'; accept: boolean }
  | { kind: 'redeem'; receiptAtomic: string; minimumReceivedAtomic: string };
const titles: Record<Action['kind'], string> = {
  fund: 'Fund the fixed rental security',
  supply: 'Supply security to the configured reserve',
  redeem: 'Redeem lending receipts into rental security',
  release_earnings: 'Release eligible earnings to your personal wallet',
  propose_claim: 'Propose a landlord claim',
  respond_to_claim: 'Record the tenant’s claim response',
  resolve_claim: 'Record the assigned arbitration decision',
  settle: 'Pay the recorded security allocation',
};

export function NativeSolana({
  request,
}: {
  request: (path: string, body?: unknown) => Promise<unknown>;
}) {
  const wallet = useRentalWallet();
  const [observation, setObservation] = useState<Observation | null>(null);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [amount, setAmount] = useState('10');
  const [evidence, setEvidence] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const tenancy = observation?.tenancy;
  const phase = tenancy?.phase;
  const role = observation?.role;
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Solana escrow is unavailable.');
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    const next = (await request('/api/finance/solana')) as
      Observation | { available: false; reason: string };
    if (!next.available) {
      setObservation(null);
      setOperation(null);
      throw new Error(next.reason);
    }
    setObservation(next);
  }
  async function plan(action: Action) {
    if (!observation) throw new Error('Read the verified test escrow first.');
    if (
      action.kind === 'propose_claim' ||
      action.kind === 'resolve_claim' ||
      (action.kind === 'respond_to_claim' && !action.accept)
    ) {
      if (evidence.trim().length < 12)
        throw new Error('Provide a reason and supporting evidence before continuing.');
      await request(`/api/agreements/${observation.agreementId}`, {
        action: 'record',
        name: titles[action.kind],
        body: evidence.trim(),
      });
    }
    const result = (await request('/api/finance/solana/operations', {
      requestId: crypto.randomUUID(),
      action,
    })) as { operation: Operation };
    setOperation(result.operation);
  }
  async function authorize() {
    if (!operation || !observation?.walletChain)
      throw new Error('Browser signing is available only for a configured devnet escrow.');
    const signed = await wallet.signSolanaTransaction({
      operationId: operation.id,
      walletId: operation.walletId,
      chain: observation.walletChain,
      feePayer: observation.feePayer,
      expiresAt: operation.expiresAt,
      transaction: Uint8Array.from(atob(operation.transactionBase64), (character) =>
        character.charCodeAt(0),
      ),
      description: titles[operation.action.kind],
    });
    const signedTxBase64 = btoa(Array.from(signed, (byte) => String.fromCharCode(byte)).join(''));
    const result = (await request(`/api/finance/solana/operations/${operation.id}/authorize`, {
      signedTxBase64,
    })) as { operation: Operation };
    setOperation(result.operation);
  }
  async function reconcile() {
    if (!operation) return;
    const result = (await request(
      `/api/finance/solana/operations/${operation.id}/reconcile`,
      {},
    )) as { operation: Operation };
    setOperation(result.operation);
    await refresh();
  }
  return (
    <section className="card operation-section" id="connected-solana-escrow">
      <div className="section-heading">
        <h2>Connected Solana escrow</h2>
        <Badge tone="neutral">Test deployment</Badge>
      </div>
      <p className="section-copy">
        Read the configured tenancy and review each native action before signing. Finalized receipts
        establish results independently of the demonstration.
      </p>
      <button
        className="button secondary"
        disabled={busy || !wallet.ready}
        onClick={() => run(refresh)}
      >
        <RefreshCw size={16} /> Read verified test escrow
      </button>
      {message && (
        <p className="note" role="status">
          {message}
        </p>
      )}
      {observation && tenancy && (
        <>
          <dl className="detail-list">
            <div>
              <dt>Your assigned role</dt>
              <dd>{role}</dd>
            </div>
            <div>
              <dt>Network / tenancy state</dt>
              <dd>
                {observation.cluster} / {phase}
              </dd>
            </div>
            <div>
              <dt>Required security</dt>
              <dd>{money(tenancy.requiredSecurityAtomic)} USDC</dd>
            </div>
            <div>
              <dt>Escrow cash</dt>
              <dd>{money(tenancy.accountedIdleAtomic)} USDC</dd>
            </div>
            <div>
              <dt>Lending receipt value</dt>
              <dd>{money(observation.receiptValueAtomic)} USDC</dd>
            </div>
            <div>
              <dt>Released earnings</dt>
              <dd>{money(tenancy.releasedEarningsAtomic)} USDC</dd>
            </div>
            <div>
              <dt>Proposed / approved claim</dt>
              <dd>
                {money(tenancy.claimAtomic)} / {money(tenancy.approvedClaimAtomic)} USDC
              </dd>
            </div>
          </dl>
          {!observation.walletChain && (
            <p className="note">
              Localnet is available for operator tests. This wallet integration does not support
              browser signing on localnet.
            </p>
          )}
          {observation.requiresRefresh && (
            <p className="note">
              The reserve observation needs refresh. Exact transaction simulation must succeed
              before authorization.
            </p>
          )}
          <div className="button-row">
            {role === 'tenant' && phase === 'awaiting-funding' && (
              <button
                className="button primary"
                disabled={busy}
                onClick={() => run(() => plan({ kind: 'fund' }))}
              >
                Review deposit funding
              </button>
            )}
            {role === 'tenant' &&
              phase === 'active' &&
              BigInt(tenancy.accountedIdleAtomic) > 0n && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    run(() => plan({ kind: 'supply', amountAtomic: tenancy.accountedIdleAtomic }))
                  }
                >
                  Review lending supply
                </button>
              )}
            {((role === 'tenant' && phase === 'active') || phase === 'settling') &&
              BigInt(tenancy.accountedReceiptsAtomic) > 0n && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      plan({
                        kind: 'redeem',
                        receiptAtomic: tenancy.accountedReceiptsAtomic,
                        minimumReceivedAtomic: observation.receiptValueAtomic,
                      }),
                    )
                  }
                >
                  Review full lending redemption
                </button>
              )}
            {role === 'tenant' && phase === 'claim-proposed' && (
              <button
                className="button primary"
                disabled={busy}
                onClick={() => run(() => plan({ kind: 'respond_to_claim', accept: true }))}
              >
                Review claim acceptance
              </button>
            )}
            {phase === 'settling' && tenancy.accountedReceiptsAtomic === '0' && (
              <button
                className="button primary"
                disabled={busy}
                onClick={() => run(() => plan({ kind: 'settle' }))}
              >
                Review recorded settlement
              </button>
            )}
          </div>
          {((phase === 'active' &&
            ((role === 'tenant' && tenancy.releasePermitted) || role === 'landlord')) ||
            (phase === 'disputed' && role === 'arbitrator') ||
            (phase === 'claim-proposed' && role === 'tenant')) && (
            <form
              className="connection-form operation-section"
              onSubmit={(event) => {
                event.preventDefault();
                void run(() =>
                  plan(
                    phase === 'claim-proposed'
                      ? { kind: 'respond_to_claim', accept: false }
                      : {
                          kind:
                            role === 'tenant'
                              ? 'release_earnings'
                              : role === 'landlord'
                                ? 'propose_claim'
                                : 'resolve_claim',
                          amountAtomic: parseAmount(amount),
                        },
                  ),
                );
              }}
            >
              {phase !== 'claim-proposed' && (
                <label>
                  {role === 'tenant' ? 'Earnings to release' : 'Landlord allocation'} (USDC)
                  <input
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    inputMode="decimal"
                  />
                </label>
              )}
              {(role !== 'tenant' || phase === 'claim-proposed') && (
                <label>
                  Reason and supporting evidence
                  <textarea
                    value={evidence}
                    onChange={(event) => setEvidence(event.target.value)}
                    maxLength={3000}
                  />
                </label>
              )}
              <p className="small-copy">
                {role === 'tenant' && phase === 'active'
                  ? 'Redeem lending receipts first. Release is limited to permitted surplus while the required security remains in escrow.'
                  : 'The private reason is stored with the agreement. A proposed or approved claim does not pay anyone.'}
              </p>
              <button className="button secondary" disabled={busy}>
                Review{' '}
                {phase === 'claim-proposed'
                  ? 'dispute'
                  : role === 'tenant'
                    ? 'earnings release'
                    : role === 'landlord'
                      ? 'claim proposal'
                      : 'arbitration decision'}
              </button>
            </form>
          )}
          <details className="operation-section">
            <summary>Operation history and deployment</summary>
            <p className="small-copy">
              Tenancy: {tenancy.address}
              <br />
              Finalized slot: {observation.slot}
              <br />
              Fee payer: {observation.feePayer}
            </p>
            <div className="button-row">
              {observation.operations
                .slice()
                .reverse()
                .map((item) => (
                  <button
                    className="button secondary"
                    disabled={busy}
                    key={item.id}
                    onClick={() => setOperation(item)}
                  >
                    {titles[item.action.kind]} · {item.state}
                  </button>
                ))}
            </div>
          </details>
        </>
      )}
      {operation && (
        <section className="operation-section">
          <div className="section-heading">
            <h3>{titles[operation.action.kind]}</h3>
            <Badge tone={operation.state === 'finalized' ? 'green' : 'neutral'}>
              {operation.state}
            </Badge>
          </div>
          <dl className="detail-list">
            {'amountAtomic' in operation.action && (
              <div>
                <dt>Amount</dt>
                <dd>{money(operation.action.amountAtomic)} USDC</dd>
              </div>
            )}
            {operation.action.kind === 'fund' && tenancy && (
              <div>
                <dt>Amount</dt>
                <dd>{money(tenancy.requiredSecurityAtomic)} USDC</dd>
              </div>
            )}
            {operation.action.kind === 'redeem' && (
              <>
                <div>
                  <dt>Receipt units to redeem</dt>
                  <dd>{operation.action.receiptAtomic} atomic units</dd>
                </div>
                <div>
                  <dt>Minimum returned to escrow</dt>
                  <dd>{money(operation.action.minimumReceivedAtomic)} USDC</dd>
                </div>
              </>
            )}
            {operation.action.kind === 'respond_to_claim' && (
              <div>
                <dt>Response</dt>
                <dd>
                  {operation.action.accept ? 'Accept the claim' : 'Request assigned arbitration'}
                </dd>
              </div>
            )}
            <div>
              <dt>Sponsor debit ceiling</dt>
              <dd>{displayAmount(operation.simulation.sponsorDebitCeilingLamports, 9, 9)} SOL</dd>
            </div>
            <div>
              <dt>Authorization expires</dt>
              <dd>{new Date(operation.expiresAt).toLocaleString()}</dd>
            </div>
          </dl>
          {operation.lastError && (
            <p className="note" role="status">
              {operation.lastError}
            </p>
          )}
          <div className="button-row">
            {['signed', 'broadcast', 'unknown'].includes(operation.state) &&
              operation.walletId === observation?.walletId && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const result = (await request(
                        `/api/finance/solana/operations/${operation.id}/retry`,
                        {},
                      )) as { operation: Operation };
                      setOperation(result.operation);
                    })
                  }
                >
                  Retry the same signed transaction
                </button>
              )}
            {operation.state === 'prepared' && operation.walletId === observation?.walletId && (
              <button
                className="button primary"
                disabled={busy || wallet.busy || !observation?.walletChain}
                onClick={() => run(authorize)}
              >
                <ShieldCheck size={16} /> Sign reviewed devnet action
              </button>
            )}
            <button className="button secondary" disabled={busy} onClick={() => run(reconcile)}>
              <RefreshCw size={16} /> Check finalized result
            </button>
          </div>
          <details className="operation-section">
            <summary>Exact authorization and receipt</summary>
            <pre className="proof-code">
              {JSON.stringify(
                {
                  id: operation.id,
                  action: operation.action,
                  actor: operation.actor,
                  nonce: operation.nonce,
                  messageSha256: operation.messageSha256,
                  signature: operation.signature,
                  expectedDeltas: operation.expectedDeltas,
                  receipt: operation.receipt,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </section>
      )}
    </section>
  );
}
