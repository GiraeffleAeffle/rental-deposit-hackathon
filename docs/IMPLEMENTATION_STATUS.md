# Implementation status

22 September 2026. The implementation target is the public `rental-deposit-hackathon` repository. The temporary name is unchanged. The legacy Gnosis application and its launch configuration are independent.

**The complete product journey runs as a persistent demonstration. Restricted native custody code and local protocol execution are proved separately on Robinhood and Solana. The end-to-end provider-connected investment journey remains incomplete.**

## What now exists

| Area                    | Implemented and checked                                                                                                                                | Remaining connected proof                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Product                 | Tenant asset progress, separate deposit, optional personal savings, claims, human arbitration, evidence, ledger export and responsive views            | Real users and a physical-phone rehearsal                                                                      |
| Persistence             | SQLite locally, PostgreSQL implementation for hosted use, atomic revisions/idempotency, durable operation recovery and a separately invocable worker   | Provisioned PostgreSQL, backups, monitoring, abuse limits and a scheduled hosted worker                                      |
| Access                  | Privy passkey/backup hooks, explicit original-wallet creation, verified JWT/user/sole-owner wallet checks, actual EIP-191/Ed25519 recovery challenges  | Server secret configuration, real passkeys, second-device recovery and cancelled-signature rehearsal            |
| Agreements              | Verified distinct parties, hashed expiring invitations, immutable term digest, both acceptances, membership-protected text evidence                    | Attachment storage, access audit and retention policy for real personal data                                   |
| Robinhood custody       | Immutable restricted escrow, Morpho shares, policy-bounded earnings, claims/arbitration and receipt-based settlement; local and mainnet-fork execution | Matching deployed app escrow and all parties completing the connected journey                                  |
| Robinhood authorization | Exact EIP-712 action, gas ceilings, persisted signed envelope before broadcast, safe ambiguous retry and canonical receipt checks                      | Initial USDG allowance with the complete fee sponsorship story; real wallet signing and measured costs         |
| Solana custody          | Compiled Anchor escrow plus actual KLend CPI in LiteSVM, fixed PDAs/accounts, local accounting and rejection tests                                     | Verified test reserve and deployed/initialized matching tenancy; devnet accounts are not inferred from mainnet |
| Solana authorization    | Exact Ed25519 message, separate fee payer, fee/rent ceiling, persisted signed bytes, finality and bounded token-delta checks; UI and worker wired      | Actual Privy/devnet signing, test sponsor funding and full zero-user-SOL rehearsal                             |
| Investments             | Separate portfolio, precision and accumulating-exposure accounting; gated 0x/Jupiter validation; real read-only Jupiter prices                         | Eligible user/instrument, reviewed live route, actual buy/sale/withdrawal and complete costs                   |

## Money and authority

The walkthrough's 3,000 → 10 → 120 → 2,880 example uses fictional amounts and a fixed sample investment price. Its “add sample return” and accumulated exposure controls are test fixtures. They never claim a real yield, purchase or cash dividend.

Connected actions use independently configured deployments, provider-verified wallets and actual native observations. A demo role selector cannot authorize a native request. Released earnings and optional savings enter personal funds; they do not increase the landlord's security claim. A failed buy retains personal cash. Neither landlord, arbitrator nor fee sponsor obtains general personal-wallet spending authority.

Private evidence is currently bounded text stored behind agreement membership, off chain. On Robinhood, a proposed claim can carry its evidence hash. Solana claim actions record the amount/approval phase; their supporting reasons remain in the private agreement history. This is not an encrypted document vault or a complete evidentiary audit system.

## Provider setup and environment

Local configuration and SQLite are prepared automatically with `npm run setup`; no credentials are checked in. The `.env.example` documents every application integration variable. `npm run reconcile` performs one authenticated pass across demo, Robinhood and Solana records. A scheduler is still required for unattended hosted operation.

The user signed in and created a Privy development app. Email and passkeys are enabled, its local development origin is allowed, and the TEE wallet environment is active without additional signing keys. The public app ID is in the ignored local configuration. An app secret exists in the dashboard but its full value is not available to this checkout, so server-side identity remains unconfigured. No real user account or wallet has been enrolled through this app. The [wallet setup guide](WALLET_SETUP.md) records the remaining steps.

The user also created a Jupiter developer organization. A project team and one API key restricted to `/swap/v2/order` exist, but the full key was not retained in local configuration. Keyless price reads still work through the app; transaction building remains unavailable. The first investment proof is scoped to eligible non-US users. Actual issuer eligibility must be verified before any executable order. At inspection, 0x's additional RWA access process accepted legal-entity requests while individual requests were paused; a normal API key is insufficient. No 0x provider request or outreach was submitted.

No native deployment or fee wallet has been funded. Solana HTTP writes reject mainnet, and localnet is an operator path without Privy browser-signing support. Robinhood sending defaults to disabled and requires the recorded deployment hash, accepted agreement and explicit sponsor limits. Its receipt policy uses three L2 confirmations; it is not an assertion of irreversible L1 settlement.

## Completed native and pricing evidence

- **Robinhood:** 25 local contract tests including conservation fuzzing, plus two actual protocol tests on a fork of mainnet block **69,829,067**. The fork supplied a local token-balance fixture and advanced time synthetically. No Robinhood transaction was sent. See [contract evidence](../contracts/evm/README.md).
- **Solana:** eight Rust host tests and three actual LiteSVM tests, including the compiled escrow and pinned KLend executable. The fixture changes the reserve/mint environment locally. This is a native execution proof, not a deployed devnet lending market. See [program evidence](../programs/rental_escrow/README.md).
- **Pricing:** Jupiter returned mainnet USDC → SPYx prices for 5, 10 and 25 USDC. The public responses are preserved in [the evidence file](evidence/JUPITER_PRICE_QUOTES_2026-09-22.json). They contain no taker or transaction. The observed route was Byreal through Metis; the currently reviewed executable decoder is narrower and does not make that price route automatically executable. Zero gas/rent fields are unmeasured placeholders.

## Before a connected hackathon rehearsal

1. Configure the existing Privy app's server secret and a stable origin; create independent tenant, landlord and arbitrator accounts and prove access to their original wallets from another browser/device.
2. Deploy and initialize a reviewed native test tenancy with the accepted agreement, fixed parties, reserve and asset. Verify its exact code and authority against the manifest.
3. Complete funding, lending, release, ordinary settlement and contested settlement through the real wallets. Measure every fee and account-creation cost. Prove initial approval and the entire declared sponsorship path.
4. Obtain actual provider/instrument access. Review the live transaction route and its signing/sponsorship compatibility, then record small buy/sell fills and reconciled personal cash withdrawal. A successful indicative quote does not complete this step.
5. Provision the hosted database, secrets, worker, backups, alerts and a stable passkey origin. Perform independent contract/security review and decide the market/provider operating arrangement before real customer funds.

The local code is ready for that connected rehearsal work. It is not a production readiness claim. See [validation](VALIDATION.md) for checks and known toolchain limits; the [ADRs](adr/README.md) explain the implementation choices.
