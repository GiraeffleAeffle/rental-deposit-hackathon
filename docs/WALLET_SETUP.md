# Passkeys and personal wallet setup

Updated 22 September 2026. The SDK integration is implemented; provider activation, real passkeys, same-wallet recovery and sponsored transactions have not yet been proved with a configured account.

## What is implemented

`WalletProvider` and `useRentalWallet()` in `src/wallets/` expose passkey signup/login, additional passkey enrollment, verified email backup linking, explicit creation of EVM and Solana embedded wallets, and user-visible signature requests. With no `NEXT_PUBLIC_PRIVY_APP_ID`, the app shows an honest setup-pending state. It does not create an anonymous wallet or simulate a successful login.

Wallet creation follows account security setup. Privy's automatic wallet creation does not run for direct passkey hooks, so the onboarding button explicitly creates missing wallets. It never replaces an existing linked wallet. Both wallets must use Privy's current user-owned embedded-wallet model; imported or delegated wallets are excluded from this first flow.

The server's `verifyPrivyToken()` checks the SDK-verified JWT and fetches current user, wallet and owner records. It returns only the verified subject and wallet identities, plus login-method status. A linked address supplied in an HTTP body or an application role inside a JWT is not trusted. Owner quorums must contain only that user, with no extra authorization keys, nested quorums, additional signers or attached automations. Application tenancy and dispute roles are assigned in the application database.

Signing is separated from submission:

- EVM transaction signing accepts only Robinhood mainnet/testnet requests for the selected wallet. This is a signature primitive, not Safe/ERC-4337 sponsorship.
- `signEvmTypedData()` reconstructs only the `RentalEscrow` version `1` / `EscrowAction` schema used by the bounded escrow relay. It binds the operation to the signer, chain, escrow, exact action, nonce and deadline. The sponsor can submit that signature to `executeSigned`; it receives no general portfolio signing authority.
- Solana signing requires the tenant to be a required signer and the declared fee payer to be a separate sponsor. The transaction's message must remain unchanged after signing. Sponsorship must already be included before quoting/signing; this helper does not rewrite Jupiter or sponsor signatures.
- Recovery signing accepts only our canonical nonce-and-expiry challenge for the currently authenticated subject and existing wallet. The result is a proof to verify server-side, not permission to move money.

The module never calls server wallet-signing endpoints, attaches session signers, requests offline delegation, or submits financial transactions. Do not enable those controls as a setup shortcut.

## Provider activation

The Privy dashboard was inspected in a dedicated background browser tab. It was signed out and offered an email sign-in/sign-up form. No personal information, credentials or account terms were submitted, and no provider account or app was created. A developer must finish their own sign-in before an app can be configured.

After sign-in:

1. Create a development app for the existing project; keep the current technical repository name while the brand is undecided. Confirm the available free development plan without adding a paid subscription.
2. Enable passkey and email authentication. Configure the exact local and preview origins. Use `http://localhost:<port>` for local passkey testing and HTTPS for a published origin; settle the relying-party/domain configuration before enrolling funded users. Do not assume a passkey enrolled for one origin works on every preview hostname.
3. Enable user-owned embedded Ethereum and Solana wallets using the current TEE wallet model. Keep server/session/additional signers and wallet automations off. The application code requests each missing wallet after passkey and backup-email setup.
4. Obtain the app ID, server app secret and optional JWT verification public key. Keep the secret in local `.env.local` or the deployment environment. Never put it in a `NEXT_PUBLIC_` variable, public repository, URL or screenshot.
5. Configure the same app ID on the client and server. Restart local development or rebuild a deployment after changing the public app ID. The client ID is public; the app secret is private.

```dotenv
NEXT_PUBLIC_PRIVY_APP_ID=
PRIVY_APP_SECRET=
# Optional PEM public verification key; literal \n escapes are supported.
PRIVY_VERIFICATION_KEY=
```

The SDK currently uses public Robinhood and Solana RPCs for wallet connection/signing. Server finance adapters own their separate configured RPCs, transaction simulation, sponsor policy and submission. Do not place a private paid RPC key in these public wallet defaults.

## Parent application integration

Wrap the interactive application with `WalletProvider`; show `WalletAccessPanel` in account onboarding. Use `useRentalWallet().getAccessToken()` for the Authorization bearer token on protected same-origin API requests. The backend calls `verifyPrivyToken(token)` and looks up the subject's role membership in the database. No cookie, URL parameter or demo role selector substitutes for that check.

`verifyPrivyToken()` returns:

```ts
{
  subject: string;
  sessionId: string;
  expiresAt: number; // Unix seconds
  wallets: Array<{ id: string; address: string; chainType: 'ethereum' | 'solana' }>;
  passkeyCount: number;
  backupLoginLinked: boolean;
}
```

It throws `IdentityError` with `unauthenticated`, `identity_unavailable` or `wallet_not_user_owned`. Handle unavailable identity as unavailable; do not silently fall back to demo or anonymous authorization.

For recovery, import `formatRecoveryMessage()` from `src/wallets/recovery.ts` directly in server code. Its challenge has `id`, `subject`, `walletId`, `chainType`, `address`, `nonce` and ISO `expiresAt`. Use a cryptographically random hex nonce, bind it to the original verified wallet, persist its expiry and consume it exactly once after successful verification. The client calls `signRecoveryChallenge(chainType, message)`; the result contains the same message/address and a hex EVM signature or base64 Solana signature.

Verify EVM signatures against that wallet with EIP-191 message verification; verify Solana's Ed25519 signature over the exact UTF-8 message. Require a separate server-issued browser identity from enrollment and validate current Privy subject/session. A client-provided device label or header is not evidence. Another browser is not physical-device attestation: record a separate observed new-device rehearsal where that claim matters. Only pass a server-verified `{subject, walletIds, checkedAt}` recovery proof to the panel; the panel never marks recovery complete from login methods alone.

These checks are implemented in `src/server/recovery.ts`. The HTTP endpoints are:

| Endpoint                       | Request                    | Result                                                                                                                                                                                       |
| ------------------------------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/identity`            | Bearer access token        | Verified `profile`, original `baseline`, optional `recoveryProof`, and recovery status. Issues a server-backed browser cookie if needed.                                                     |
| `POST /api/identity/baseline`  | `{}`                       | Records the current provider-verified EVM and Solana wallets once. Requires a passkey and verified backup login. Existing originals cannot be replaced by this endpoint.                     |
| `POST /api/identity/challenge` | `{walletId}`               | Returns `{challenge, message}` for one original wallet. Requires another issued browser cookie and a different Privy session from enrollment.                                                |
| `POST /api/identity/verify`    | `{challengeId, signature}` | Verifies the exact stored message, atomically consumes the challenge and returns refreshed profile/status. Completes the proof after both wallets sign in the same recovery browser/session. |

Every write requires the same `Origin` as `APP_ORIGIN` (or the request origin for local development), an authenticated bearer token, JSON, and the cookie issued by `GET`. The HTTPS cookie uses the `__Host-` prefix, `Secure`, `HttpOnly`, `SameSite=Strict` and `Path=/`. Only its hash is stored; supplying an arbitrary hex cookie does not establish a browser. Responses are not cached. Set `APP_ORIGIN` to the published application's exact origin in a hosted environment.

Challenges expire after five minutes. A failed signature leaves the challenge available for a correct retry; a verified or expired challenge cannot be reused. Concurrent verification and proof completion are serialized by `Store.update`, so a server restart or duplicate HTTP request does not verify a nonce twice. Both signatures must belong to the same recovery browser/session; the recorded originals and checked-at time are server values. The read-only `requireWalletRecovery(store, verifiedIdentity, walletId)` gate rejects missing proof or any change to the current wallet inventory before connected finance can proceed.

The seven server tests exercise actual EIP-191 and Ed25519 verification, persisted proof, replay after restart, racing duplicates, expiry, invalid signatures, wrong account/wallet/browser/session, baseline replacement, forged browser cookies and cross-origin requests. These are local cryptographic and HTTP-handler tests; they do not substitute for a real Privy login and device rehearsal.

The client signing methods do not replace server validation of operation membership, immutable tenancy network/asset, quote expiry, amounts, allowed recipients, nonce or signatures. A complete connected money flow still requires finance adapter simulation, sponsored submission and durable reconciliation.

## Acceptance still to run with provider access

1. Create an account using a passkey, link and verify the backup email, then create both wallets. Confirm server-fetched wallet ownership and record the initial IDs/addresses.
2. Log in on another browser using backup access, sign fresh recovery challenges and verify the exact same wallet IDs/addresses. Repeat on another physical device, including a mobile browser. Never create replacement wallets to make this test pass.
3. Cancel signup, email verification, wallet creation and a signing request. Verify useful recovery UI and no financial submission. Retry partial wallet creation without duplicating the existing wallet.
4. Inspect a real Robinhood escrow action and a Solana sponsored transaction. Confirm visible wallet approval, signature binding and rejection of changed amount, chain, escrow, signer, sponsor or expired request.
5. Run the whole declared flow with zero native user gas balance, including account creation, and show actual sponsor costs. These wallet hooks alone do not prove the fee budget or complete deposit/investment path.

Local automated tests verify real ES256 access-token validation, owner restrictions, network-aware identity, canonical recovery binding, sponsored Solana transaction structure and EIP-712 signature binding. They use generated test keys and protocol fixtures, with no provider account or real funds.

## Primary references

- [Privy passkeys](https://docs.privy.io/authentication/user-authentication/login-methods/passkey)
- [Account linking](https://docs.privy.io/user-management/users/linking-accounts)
- [Automatic wallet creation restrictions](https://docs.privy.io/basics/react/advanced/automatic-wallet-creation)
- [Access-token verification](https://docs.privy.io/authentication/user-authentication/access-tokens)
- [EVM sign-only requests](https://docs.privy.io/wallets/using-wallets/ethereum/sign-a-transaction)
- [Solana sign-only requests](https://docs.privy.io/wallets/using-wallets/solana/sign-a-transaction)
- [Robinhood network configuration](https://docs.robinhood.com/chain/connecting/)

The pinned Node SDK `0.35.0` has `client.utils().auth().verifyAccessToken(token: string)` and returns snake-case claim fields. The live documentation example used an object argument when inspected; the implementation is type-checked against the installed SDK.
