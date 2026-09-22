'use client';

import { useSyncExternalStore } from 'react';
import { useRentalWallet } from './provider.tsx';
import styles from './access-panel.module.css';

const subscribe = () => () => undefined;
const supportsPasskeys = () =>
  typeof window !== 'undefined' &&
  window.isSecureContext &&
  typeof PublicKeyCredential !== 'undefined';

export interface WalletRecoveryProof {
  subject: string;
  walletIds: string[];
  checkedAt: string;
}

export function WalletAccessPanel({ recoveryProof }: { recoveryProof?: WalletRecoveryProof }) {
  const access = useRentalWallet();
  const passkeysAvailable = useSyncExternalStore(subscribe, supportsPasskeys, () => false);
  const disabled = !access.ready || access.busy;
  const hasBothWallets =
    access.wallets.some((wallet) => wallet.chainType === 'ethereum') &&
    access.wallets.some((wallet) => wallet.chainType === 'solana');
  const recoveryVerified =
    hasBothWallets &&
    recoveryProof?.subject === access.subject &&
    Number.isFinite(Date.parse(recoveryProof.checkedAt)) &&
    access.wallets.every((wallet) => recoveryProof.walletIds.includes(wallet.id));
  const run = (action: () => Promise<void>) => void action().catch(() => undefined);

  if (!access.configured) {
    return (
      <section className={styles.panel} aria-labelledby="wallet-access-title">
        <div className={styles.eyebrow}>Account access</div>
        <h3 id="wallet-access-title">Your assets, your account</h3>
        <p>
          Passkey access and personal wallets are being connected. The walkthrough uses fictional
          balances until account setup is complete.
        </p>
        <span className={styles.pending}>Provider setup pending</span>
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-labelledby="wallet-access-title" aria-busy={access.busy}>
      <div className={styles.eyebrow}>Account access</div>
      <h3 id="wallet-access-title">Keep your assets with you</h3>
      <p>
        Use a passkey to access your personal wallet. Add backup access before you fund a deposit.
      </p>
      {!access.ready && <p role="status">Connecting account access…</p>}
      {!access.authenticated ? (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primary}
            disabled={disabled || !passkeysAvailable}
            onClick={() => run(access.signupWithPasskey)}
          >
            Create account with a passkey
          </button>
          <button
            type="button"
            disabled={disabled || !passkeysAvailable}
            onClick={() => run(access.loginWithPasskey)}
          >
            Sign in with passkey
          </button>
          <button
            type="button"
            className={styles.textButton}
            disabled={disabled}
            onClick={access.loginWithBackup}
          >
            Use email access
          </button>
        </div>
      ) : (
        <>
          <ol className={styles.steps}>
            <li>
              <div>
                <strong>Passkey</strong>
                <span>
                  {access.passkeyCount > 0
                    ? `${access.passkeyCount} registered`
                    : 'Add your first passkey'}
                </span>
              </div>
              <button
                type="button"
                disabled={disabled || !passkeysAvailable}
                onClick={() => run(access.addPasskey)}
              >
                {access.passkeyCount ? 'Add another' : 'Add passkey'}
              </button>
            </li>
            <li>
              <div>
                <strong>Backup access</strong>
                <span>
                  {access.backupLoginLinked
                    ? 'Email linked and verified'
                    : 'Add an email you can access elsewhere'}
                </span>
              </div>
              {!access.backupLoginLinked && (
                <button type="button" disabled={disabled} onClick={access.addBackupEmail}>
                  Add backup email
                </button>
              )}
            </li>
            <li>
              <div>
                <strong>Personal wallets</strong>
                <span>
                  {hasBothWallets
                    ? 'Robinhood and Solana wallets linked'
                    : 'Create wallets after securing your account'}
                </span>
              </div>
              {!hasBothWallets && (
                <button
                  type="button"
                  disabled={disabled || access.passkeyCount === 0 || !access.backupLoginLinked}
                  onClick={() => run(access.createMissingWallets)}
                >
                  Create wallets
                </button>
              )}
            </li>
            <li>
              <div>
                <strong>Recovery check</strong>
                <span>
                  {recoveryVerified
                    ? 'Same-wallet access verified in another browser'
                    : 'Second-browser check pending'}
                </span>
              </div>
              <span className={recoveryVerified ? styles.complete : styles.pending}>
                {recoveryVerified ? 'Verified' : 'Before funding'}
              </span>
            </li>
          </ol>
          {hasBothWallets && !recoveryVerified && (
            <p className={styles.note}>
              On another device, sign in to this same account with your backup access and verify the
              same wallet addresses. Linked login methods alone do not prove recovery.
            </p>
          )}
          {access.wallets.length > 0 && (
            <details className={styles.details}>
              <summary>Wallet and control details</summary>
              {access.wallets.map((wallet) => (
                <div className={styles.wallet} key={wallet.id}>
                  <strong>{wallet.chainType === 'solana' ? 'Solana' : 'Robinhood Chain'}</strong>
                  <code>{wallet.address}</code>
                  <span>
                    {wallet.connected
                      ? 'Ready to request your signature'
                      : 'Waiting for wallet connection'}
                  </span>
                </div>
              ))}
              <p>
                Your passkey signs you in; your embedded wallet signs transactions you approve. This
                app does not add a server signer or give landlords or arbitrators access to your
                personal wallet.
              </p>
            </details>
          )}
          <button
            type="button"
            className={styles.textButton}
            disabled={disabled}
            onClick={() => run(access.logout)}
          >
            Sign out
          </button>
        </>
      )}
      {!passkeysAvailable && access.ready && (
        <p className={styles.note}>
          Passkeys need a supported browser on HTTPS or localhost. Email access remains available;
          add your passkey from a supported device before funding.
        </p>
      )}
      {access.error && (
        <p className={styles.error} role="alert">
          {access.error}
        </p>
      )}
    </section>
  );
}
