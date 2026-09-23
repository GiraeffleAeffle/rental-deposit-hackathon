'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, CircleHelp, Clock3, RefreshCw, ShieldCheck } from 'lucide-react';
import { WalletAccessPanel, useRentalWallet } from '@/wallets';
import { Badge, PageHeading } from './workspace-panels';
import type { connectionStatus } from '@/server/configuration';
import type { IdentitySnapshot } from '@/server/recovery';
import { ConnectedAgreements } from './connected-agreements';
import { NativeRobinhood } from './native-robinhood';
import { NativeSolana } from './native-solana';
import { SolanaInitializationPanel } from './solana-initialization';
import { MarketPrices } from './market-prices';

type Status = ReturnType<typeof connectionStatus> & { storeAvailable: boolean };
export function Connections() {
  const wallet = useRentalWallet();
  const accountScope = JSON.stringify([
    wallet.authenticated ? wallet.subject : null,
    wallet.passkeyCount,
    wallet.backupLoginLinked,
    wallet.wallets.map(({ id, chainType, address }) => [id, chainType, address]).sort(),
  ]);
  // A different account or wallet inventory must not inherit identity or tenancy UI state.
  return <AccountConnections key={accountScope} />;
}
function AccountConnections() {
  const wallet = useRentalWallet();
  const [status, setStatus] = useState<Status | null>(null);
  const [identity, setIdentity] = useState<IdentitySnapshot | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const requests = useRef<AbortController | null>(null);
  const disabled = busy || wallet.busy || !wallet.ready;
  const authorized = useCallback(
    async (path: string, body?: unknown) => {
      const controller = requests.current;
      if (!controller || controller.signal.aborted)
        throw new Error('Account access changed. Check the current account before continuing.');
      const token = await wallet.getAccessToken();
      controller.signal.throwIfAborted();
      if (!token) throw new Error('Sign in before continuing.');
      const response = await fetch(path, {
        method: body ? 'POST' : 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const data = await response.json();
      controller.signal.throwIfAborted();
      if (!response.ok) throw new Error(data.error || 'Account verification is unavailable.');
      return data;
    },
    [wallet],
  );
  useEffect(() => {
    const controller = new AbortController();
    requests.current = controller;
    fetch('/api/status', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Connection status could not be loaded.');
        return response.json();
      })
      .then(setStatus)
      .catch(() => {
        if (!controller.signal.aborted) setError('Connection status could not be loaded.');
      });
    return () => controller.abort();
  }, []);
  function rememberIdentity(next: IdentitySnapshot) {
    if (!wallet.authenticated || next.profile.subject !== wallet.subject)
      throw new Error('The verified account changed. Check the current account again.');
    requests.current?.signal.throwIfAborted();
    setIdentity(next);
  }
  async function inspectIdentity() {
    if (disabled) return;
    setBusy(true);
    setError('');
    try {
      rememberIdentity(await authorized('/api/identity'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Account access is unavailable.');
    } finally {
      setBusy(false);
    }
  }
  async function enroll() {
    if (disabled) return;
    setBusy(true);
    setError('');
    try {
      rememberIdentity(await authorized('/api/identity/baseline', {}));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enrollment is unavailable.');
    } finally {
      setBusy(false);
    }
  }
  async function verifyRecovery() {
    if (disabled) return;
    setBusy(true);
    setError('');
    try {
      if (!identity?.baseline)
        throw new Error('Record the original wallets in your first browser.');
      for (const original of identity.baseline.wallets) {
        if (identity.recovery.verifiedWalletIds.includes(original.id)) continue;
        const issued = await authorized('/api/identity/challenge', { walletId: original.id });
        requests.current?.signal.throwIfAborted();
        const signed = await wallet.signRecoveryChallenge(original.chainType, issued.message);
        rememberIdentity(
          await authorized('/api/identity/verify', {
            challengeId: issued.challenge.id,
            signature: signed.signature,
          }),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Recovery check could not finish.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="FROM DEMONSTRATION TO CONNECTED PROOF"
        title="Know what is connected."
        text="The walkthrough and native finance proofs are separate. This page shows account access and the remaining integration steps."
      />
      {error && (
        <div className="notice is-error" role="alert">
          <CircleHelp size={18} />
          {error}
        </div>
      )}
      <WalletAccessPanel recoveryProof={identity?.recoveryProof ?? undefined} />
      {wallet.authenticated && (
        <section className="card operation-section">
          <h2>Verify access to the same wallets</h2>
          <p className="section-copy">
            Record your original wallet identities here. Then sign in with backup access in another
            browser and sign a recovery challenge for each wallet.
          </p>
          <div className="button-row">
            <button className="button secondary" disabled={disabled} onClick={inspectIdentity}>
              <RefreshCw size={16} />
              Check verified account
            </button>
            {identity?.recovery.status === 'needs_baseline' && (
              <button className="button primary" disabled={disabled} onClick={enroll}>
                Record original wallets
              </button>
            )}
            {identity?.recovery.eligibleForChallenge &&
              identity.baseline?.wallets.some(
                (original) => !identity.recovery.verifiedWalletIds.includes(original.id),
              ) && (
                <button className="button primary" disabled={disabled} onClick={verifyRecovery}>
                  Verify same-wallet access <ShieldCheck size={17} />
                </button>
              )}
          </div>
          {identity && (
            <p className="small-copy" role="status">
              {identity.baseline &&
                `Original wallets recorded ${new Date(identity.baseline.enrolledAt).toLocaleString()}. `}
              {recoveryInstructions[identity.recovery.status]}
            </p>
          )}
        </section>
      )}
      {wallet.authenticated && <ConnectedAgreements request={authorized} />}
      <div className="connection-grid">
        <section className="card">
          <span className="eyebrow">SHARED APPLICATION</span>
          <h2>Persistence and account access</h2>
          <ul className="connection-list">
            <StatusItem
              ready={Boolean(status?.storeAvailable)}
              title="Persistent tenancy records"
              detail={
                status?.storeAvailable
                  ? status.persistence === 'postgres'
                    ? 'PostgreSQL is connected.'
                    : 'Local SQLite is available for this computer.'
                  : 'A database connection is needed.'
              }
            />
            <StatusItem
              ready={Boolean(status?.identity)}
              title="Privy passkey provider"
              detail={
                status?.identity
                  ? 'Credentials are configured. Verify login and wallet recovery on each deployment origin before funding.'
                  : wallet.configured
                    ? 'Browser access is configured. Add the server secret to verify accounts for connected finance.'
                    : 'Create a Privy app, add the application origin and configure its credentials.'
              }
            />
            <StatusItem
              ready={Boolean(status?.reconciliation)}
              title="Background reconciliation"
              detail={
                status?.reconciliation
                  ? 'Worker authentication is configured. Check the operator guide for scheduling.'
                  : 'The manual result check works. Schedule the authenticated worker for unattended reconciliation.'
              }
            />
          </ul>
          <a
            className="button secondary"
            href="https://dashboard.privy.io/"
            target="_blank"
            rel="noreferrer"
          >
            Open Privy setup <ArrowUpRight size={16} />
          </a>
        </section>
        <section className="card">
          <span className="eyebrow">EVIDENCE YOU CAN INSPECT</span>
          <h2>Two independent native implementations</h2>
          <ul className="connection-list">
            <StatusItem
              ready
              title="Robinhood: actual Morpho contracts on a local fork"
              detail="Escrow funding, supply, earnings release and settlement pass against pinned mainnet protocol code. Earnings time travel is a local fixture."
            />
            <StatusItem
              ready
              title="Solana: escrow and Kamino integration"
              detail="The compiled escrow and actual KLend program pass local SVM funding, lending, release and settlement checks. A deployed test escrow remains to be configured."
            />
            <StatusItem
              ready={false}
              title="Personal investment orders"
              detail="Jupiter and 0x adapters validate routes and keep raw holdings distinct from accumulated exposure. Real orders need provider access and a verified eligible non-US profile."
            />
          </ul>
          <Badge tone="neutral">A local proof is not a production deployment</Badge>
        </section>
      </div>
      <div className="connection-grid">
        <section className="card">
          <span className="eyebrow">ROBINHOOD CHAIN</span>
          <h2>USDG → Morpho → personal holdings</h2>
          <p className="section-copy">
            A restricted escrow fixes the tenancy parties and spending rules. Signed instructions
            can be relayed without giving the sponsor access to funds.
          </p>
          <ul className="connection-list">
            <StatusItem
              ready={Boolean(status?.robinhood.escrow)}
              title="Application escrow"
              detail={
                status?.robinhood.escrow
                  ? 'A deployment address is configured; verify its identity before authorization.'
                  : 'No application deployment is configured.'
              }
            />
            <StatusItem
              ready={Boolean(status?.robinhood.sponsor)}
              title="Bounded transaction sponsor"
              detail="A sponsor pays network fees only. Initial USDG approval still needs a proven sponsorship route."
            />
            <StatusItem
              ready={Boolean(status?.robinhood.trading)}
              title="Stock-token route access"
              detail="0x RWA access and instrument eligibility must be granted before an executable order."
            />
          </ul>
          <a
            className="text-button"
            href="https://dashboard.0x.org/"
            target="_blank"
            rel="noreferrer"
          >
            0x developer access <ArrowUpRight size={15} />
          </a>
        </section>
        <section className="card">
          <span className="eyebrow">SOLANA</span>
          <h2>USDC → Kamino → personal holdings</h2>
          <p className="section-copy">
            A tenancy PDA holds security. The tenant’s separate wallet holds personal cash and
            investments; a fee sponsor has no spending authority.
          </p>
          <ul className="connection-list">
            <StatusItem
              ready={Boolean(status?.solana.deployment)}
              title="Verified test deployment"
              detail="A manifest must pin the program, cluster, reserve and token accounts. Devnet does not provide an issuer SPYx market."
            />
            <StatusItem
              ready={Boolean(status?.solana.sponsor)}
              title="Separate fee payer"
              detail="The complete signed message and simulation are checked before a sponsor may add its signature."
            />
            <StatusItem
              ready={Boolean(status?.solana.trading)}
              title="Jupiter route access"
              detail="Price-only quotes work without a key. Transaction builds require configured access, an eligible instrument and a reviewed route."
            />
          </ul>
          <a
            className="text-button"
            href="https://developers.jup.ag/portal"
            target="_blank"
            rel="noreferrer"
          >
            Jupiter developer access <ArrowUpRight size={15} />
          </a>
        </section>
      </div>
      <MarketPrices />
      {wallet.authenticated && (
        <>
          <NativeRobinhood request={authorized} />
          <SolanaInitializationPanel request={authorized} />
          <NativeSolana request={authorized} />
        </>
      )}
    </>
  );
}
const recoveryInstructions: Record<IdentitySnapshot['recovery']['status'], string> = {
  needs_setup:
    'Add a passkey, verify your backup email and create both personal wallets above. Then check the verified account again.',
  needs_baseline:
    'Record these original wallets before opening a recovery check in another browser.',
  wallet_changed:
    'The current wallets differ from the recorded originals. Sign in to the original account and restore access to those wallets before funding.',
  use_another_browser:
    'Continue in a different browser using backup access, then check the verified account there.',
  sign_in_again:
    'This browser still uses the enrollment sign-in session. Sign out here, sign in again with backup access and check the verified account.',
  ready:
    'Sign a recovery challenge for each original wallet. Both signatures are required before funding.',
  verified: 'Same-wallet access verified in another browser.',
};
function StatusItem({ ready, title, detail }: { ready: boolean; title: string; detail: string }) {
  return (
    <li>
      {ready ? <Check size={18} /> : <Clock3 size={18} />}
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </li>
  );
}
