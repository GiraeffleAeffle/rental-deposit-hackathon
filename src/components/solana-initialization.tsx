'use client';
import { useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { useRentalWallet } from '@/wallets';
import type { SolanaInitialization } from '@/server/solana-initialization';
import { Badge, money } from './workspace-panels';

type Role = 'tenant' | 'landlord' | 'arbitrator';
type Initialization = Omit<SolanaInitialization, 'signatures' | 'signedTxBase64'> & {
  signedRoles: ('tenant' | 'landlord')[];
  role: Role;
  walletId: string;
  feePayer: string;
  cluster: 'devnet' | 'localnet';
  walletChain: 'solana:devnet' | null;
};
type Setup = {
  available: true;
  agreementId: string;
  tenancyAddress: string;
  role: Role;
  walletId: string;
  feePayer: string;
  cluster: 'devnet' | 'localnet';
  walletChain: 'solana:devnet' | null;
  initialization: Initialization | null;
};
export function SolanaInitializationPanel({
  request,
}: {
  request: (path: string, body?: unknown) => Promise<unknown>;
}) {
  const wallet = useRentalWallet();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const initialization = setup?.initialization;
  const role = setup?.role;
  const signed = Boolean(role && initialization?.signedRoles.includes(role as 'tenant' | 'landlord'));
  const awaitingSignature =
    initialization?.state === 'prepared' &&
    role !== 'arbitrator' &&
    !signed;
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Solana setup is unavailable.');
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    const result = (await request('/api/finance/solana/initialize')) as Setup;
    setSetup(result);
  }
  async function change(action: 'prepare' | 'reconcile' | 'retry', notice: string) {
    const result = (await request('/api/finance/solana/initialize', { action })) as {
      initialization: Initialization;
    };
    setSetup((current) => current && { ...current, initialization: result.initialization });
    setMessage(notice);
  }
  async function sign() {
    if (!initialization || !setup?.walletChain || !awaitingSignature)
      throw new Error('Refresh the current initialization before signing.');
    if (Date.parse(initialization.expiresAt) <= Date.now())
      throw new Error('The signing window expired. Prepare a fresh one with both parties ready.');
    const transaction = Uint8Array.from(atob(initialization.transactionBase64), (item) =>
      item.charCodeAt(0),
    );
    const signedBytes = await wallet.signSolanaTransaction({
      operationId: `initialize:${initialization.agreementId}`,
      walletId: setup.walletId,
      chain: setup.walletChain,
      feePayer: setup.feePayer,
      expiresAt: initialization.expiresAt,
      transaction,
      description: `Initialize the ${money(initialization.requiredSecurityAtomic)} test-USDC rental security for agreement ${initialization.agreementId}. This does not fund it.`,
    });
    const signedTxBase64 = btoa(
      Array.from(signedBytes, (byte) => String.fromCharCode(byte)).join(''),
    );
    const result = (await request('/api/finance/solana/initialize', {
      action: 'sign',
      signedTxBase64,
    })) as { initialization: Initialization };
    setSetup((current) => current && { ...current, initialization: result.initialization });
    setMessage(
      result.initialization.state === 'prepared'
        ? 'Your signature is recorded. The other party must review and sign these same bytes before expiry.'
        : 'Both parties signed. The fee sponsor submitted the exact initialization transaction.',
    );
  }
  return (
    <section className="card operation-section">
      <div className="section-heading">
        <h2>Initialize the Solana tenancy</h2>
        <Badge tone="neutral">Agreement setup</Badge>
      </div>
      <p className="section-copy">
        This step fixes the three participants, test-USDC payout accounts, security amount and release
        rule on devnet. Tenant and landlord sign the same message; a separate sponsor pays only native
        fees and account rent. Funding is a later tenant action.
      </p>
      <button className="button secondary" disabled={busy || !wallet.ready} onClick={() => run(refresh)}>
        <RefreshCw size={16} /> Read setup
      </button>
      {message && <p className="note" role="status">{message}</p>}
      {setup && (
        <>
          <dl className="detail-list">
            <div><dt>Agreement</dt><dd className="mono">{setup.agreementId}</dd></div>
            <div><dt>Your role</dt><dd>{setup.role}</dd></div>
            <div><dt>Network</dt><dd>{setup.cluster}</dd></div>
            <div><dt>Tenancy address</dt><dd className="mono">{setup.tenancyAddress}</dd></div>
          </dl>
          {!initialization ? (
            <p className="note">
              No initialization is prepared. Both parties must accept the agreement, and the operator
              must configure its derived tenancy, verified deployment, payout token accounts and fee sponsor.
            </p>
          ) : (
            <>
              <dl className="detail-list">
                <div><dt>State</dt><dd>{initialization.state}</dd></div>
                <div><dt>Required security</dt><dd>{money(initialization.requiredSecurityAtomic)} test USDC</dd></div>
                <div><dt>Earnings release</dt><dd>{initialization.releasePermitted ? 'Permitted above security' : 'Retained until settlement'}</dd></div>
                <div><dt>Tenant</dt><dd className="mono">{initialization.tenant}</dd></div>
                <div><dt>Landlord</dt><dd className="mono">{initialization.landlord}</dd></div>
                <div><dt>Arbitrator</dt><dd className="mono">{initialization.arbitrator}</dd></div>
                <div><dt>Policy hash</dt><dd className="mono">{initialization.policyHash}</dd></div>
                <div><dt>Tenant payout</dt><dd className="mono">{initialization.tenantDestination}</dd></div>
                <div><dt>Landlord payout</dt><dd className="mono">{initialization.landlordDestination}</dd></div>
                <div><dt>Signed by</dt><dd>{initialization.signedRoles.join(' and ') || 'Neither party yet'}</dd></div>
                {initialization.state === 'prepared' && (
                  <div><dt>Sign before</dt><dd>{new Date(initialization.expiresAt).toLocaleTimeString()}</dd></div>
                )}
                {initialization.signature && (
                  <div><dt>Transaction</dt><dd className="mono">{initialization.signature}</dd></div>
                )}
              </dl>
              {initialization.lastError && <p className="note">{initialization.lastError}</p>}
            </>
          )}
          <div className="button-row">
            {role !== 'arbitrator' &&
              (!initialization || initialization.state === 'failed' || initialization.state === 'prepared') && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => run(() => change('prepare', 'Initialization is ready for both signatures.'))}
                >
                  Prepare or refresh signing window
                </button>
              )}
            {awaitingSignature && (
              <button className="button primary" disabled={busy} onClick={() => run(sign)}>
                <ShieldCheck size={16} /> Review and sign setup
              </button>
            )}
            {initialization?.signature && initialization.state !== 'finalized' && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => run(() => change('reconcile', 'Checked the finalized on-chain receipt.'))}
              >
                Check finality
              </button>
            )}
            {initialization?.state === 'unknown' && role !== 'arbitrator' && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => run(() => change('retry', 'Checked whether the same signed transaction can be resent.'))}
              >
                Retry same signed transaction
              </button>
            )}
          </div>
          {initialization?.state === 'finalized' && (
            <p className="note">
              The initialized tenancy matches the accepted agreement. Read the connected escrow below
              to inspect it, then the tenant can fund the fixed security amount.
            </p>
          )}
        </>
      )}
    </section>
  );
}
