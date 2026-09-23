# Solana test escrow service

These Node routes connect accepted tenancy agreements and the original recovered Privy wallets to the restricted native escrow. They support one explicitly configured tenancy on **devnet or localnet**. They do not deploy a program, create a tenancy, mint funds, create provider accounts, or enable mainnet transactions. Missing configuration returns `available: false`; malformed or unverifiable configuration prevents financial operations.

The native Anchor/Kamino execution proof is described in [`programs/rental_escrow/README.md`](../../../../programs/rental_escrow/README.md). Its LiteSVM fixture is a local runtime proof, not an RPC deployment. No complete Privy → deployed devnet escrow journey has been demonstrated yet.

## Required operator configuration

Set these **server-only** variables; none may use a `NEXT_PUBLIC_` prefix:

| Variable                     | Value                                                                                                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SOLANA_RPC_URL`             | The reviewed test RPC. HTTPS is required except for a loopback HTTP endpoint.                                                                                              |
| `SOLANA_DEPLOYMENT_MANIFEST` | JSON matching the schema below, recorded from the actual deployment and reserve accounts.                                                                                  |
| `SOLANA_SPONSOR_KEYPAIR`     | A dedicated test sponsor's 64-byte Solana keypair as a JSON integer array, held in local environment storage or a secret manager. It must differ from every tenancy party. |

The following is a **schema example, not usable deployment configuration**. Replace each placeholder with independently verified test-chain evidence. A read-only probe has found test-USDC reserve candidates, but none is selected or proved executable with this escrow. There is no initialized tenancy to substitute automatically.

Run `node --experimental-strip-types scripts/probe-solana-devnet.mjs` from the repository root to repeat the public devnet account probe. It checks the pinned genesis, test mint, KLend executable, reserve/market/vault identities, receipt mint and configured oracle-account presence without creating accounts or sending transactions. The [23 September snapshot](../../../../docs/evidence/SOLANA_DEVNET_RESERVES_2026-09-23.json) contains 21 matches, 17 passing account-state checks. [Third-party finalized receipts](../../../../docs/evidence/SOLANA_DEVNET_RECEIPTS_2026-09-23.json) show a successful batch refresh and receipt redemption involving one recent candidate. They do not exercise this escrow's exact refresh/supply/redemption sequence. Recheck live state before choosing a candidate; keep app writes disabled until its own small test transaction and deployment manifest have been reviewed.

```json
{
  "cluster": "devnet",
  "genesisHash": "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  "escrowProgram": "<deployed-test-program-address>",
  "programSha256": "<64-lowercase-hex-sha256-of-built-so>",
  "programCodeLength": 1000,
  "upgradeAuthority": "<reviewed-upgrade-authority-or-null>",
  "depositMint": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  "market": "<test-KLend-market>",
  "reserve": "<test-KLend-reserve>",
  "receiptMint": "<receipt-mint-recorded-in-reserve>",
  "liquiditySupply": "<liquidity-vault-recorded-in-reserve>",
  "marketAuthority": "<derived-KLend-market-authority>",
  "oracleAccounts": ["<configured-test-oracle-if-required>"],
  "maxObservationAgeMs": 15000,
  "agreementId": "<accepted-application-agreement-id>",
  "tenancyAddress": "<initialized-tenancy-PDA>",
  "maximumSponsorLamports": "100000"
}
```

`programCodeLength` is the exact byte length of the reviewed `.so`, not the placeholder `1000`. The service validates the program loader, executable flag, ProgramData address, upgrade authority, code length and SHA-256. Upgradeable-loader allocation padding after the recorded code must be all zero. An immutable legacy BPF deployment requires `upgradeAuthority: null`. A changed executable or authority requires a new review and proof; updating an environment value alone does not establish that proof.

For localnet, use its actual genesis hash and `cluster: "localnet"`. The asset remains the explicitly configured test USDC mint. The mainnet genesis is rejected even when mislabeled as localnet. Every operation checks RPC genesis, program bytes, tenancy PDA, mint identities, reserve/market ownership, configured vaults/oracles and token-account authorities. A mainnet reserve address does not imply a matching devnet account. The locally modified SVM reserve cannot be represented as an issuer-backed or deployed devnet reserve.

The sponsor ceiling applies to the **simulated native balance debit plus transaction fee**, including possible rent. It is deliberately conservative if the simulation already deducted the fee. The cap cannot exceed `10000000` lamports in this prototype. A changed finalized bank between the balance observation and simulation requires a fresh review. All current operations use preexisting token accounts; initialization rent is outside this API.

## CLI deployment and initialization boundary

This work did not execute the following deployment steps. They are operator prerequisites for a deployed demo, after choosing and proving the test reserve. A running RPC/local validator or actual devnet deployment is required; LiteSVM does not supply an RPC server.

1. Build the reviewed program with `test-deployment`, following the native README. The default build intentionally rejects initialization. Record the `.so` hash and byte count, source revision and build-tool versions. The original operator machine retains the previously reviewed 396,536-byte artifact (SHA-256 `a883a31c32d393c1869c93cbae733536233e98533cf8d56ecfa311c562f7d577`) and its matching program key in ignored `.testnet-secrets/solana/`; this is local operator state, not a repo artifact or a deployment. If a new operator uses another program keypair, update `declare_id!` and `Anchor.toml` to that public key, then rebuild and repeat the native proof. Never commit a keypair.
2. With the operator's Solana CLI and funded **test** deployment wallet, check the exact test genesis and deploy the reviewed artifact explicitly. For example, `solana --url devnet genesis-hash` and `solana --url devnet program deploy --program-id /secure/test-program-keypair.json /reviewed/rental_escrow.so --keypair /secure/test-deployer-keypair.json`. These commands publish to devnet; they were not run by this implementation. Inspect the resulting Program/ProgramData and upgrade authority before preparing the manifest. The service performs its own code verification again.
3. Record a complete Solana agreement in the application. Its tenant, landlord and assigned arbitrator must be the actual original wallet identities. Tenant and landlord must accept the same `agreementDigest`. Complete the existing recovery gate with both original EVM and Solana wallets in the second browser/session, plus the current passkey and backup login requirements.
4. Precreate the fixed tenant and landlord test-USDC payout accounts. Initialize the tenancy with `buildInitializeEscrow` from `src/finance/solana`, a unique 32-byte lease ID, the accepted digest's 32 raw bytes, required security in atomic units, the release policy, fixed party/payout addresses and the verified reserve manifest. Compile one immutable transaction and collect **tenant and landlord signatures on that same message**; a separate payer signs and funds rent. Each participant must verify the message before signing. The native program enforces both signatures. This is an explicit operator initialization transaction; there is no initialization HTTP route or unattended multisignature coordinator in this prototype.
5. Verify the finalized initialized account and derived cash/receipt PDAs, then set the manifest's `agreementId` and `tenancyAddress`. An accepted off-chain agreement alone cannot enable funding. Conversely, an unrelated initialized PDA cannot pass the agreement/digest binding.

Until those steps are proved, the honest live availability state is **unavailable**. The restricted escrow and real KLend CPI remain testable in the documented local SVM without creating external accounts or spending real funds.

## HTTP contract

All endpoints require the application's verified bearer token. Writes additionally require the expected same-origin request. Financial values are canonical decimal strings of atomic units; no JavaScript floating-point money crosses the boundary.

| Endpoint                                            | Input and result                                                                                                                                                             |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/finance/solana`                           | Availability, verified party/`walletId`, `feePayer`, cluster/genesis, tenancy balances, operation history and trading availability.                                          |
| `POST /api/finance/solana/operations`               | `{ "requestId": "stable_request_id", "action": { "kind": "fund" } }`; returns `{ "operation": ... }`.                                                                        |
| `GET /api/finance/solana/operations/:id`            | The persisted operation and receipt state.                                                                                                                                   |
| `POST /api/finance/solana/operations/:id/authorize` | `{ "signedTxBase64": "<actor-signed-transaction>" }`; returns the persisted send/unknown state.                                                                              |
| `POST /api/finance/solana/operations/:id/reconcile` | `{}`; reads chain evidence and returns the receipt state. It neither signs nor sends a new transaction.                                                                      |
| `POST /api/finance/solana/operations/:id/retry`     | `{}`; the original recovered actor can reconcile and conditionally resend only the already persisted signed transaction. No transaction bytes or new signature are accepted. |

Supported actions are `fund`, `supply`, `redeem`, `release_earnings`, `propose_claim`, `respond_to_claim`, `resolve_claim`, and `settle`. Amount-bearing actions use `amountAtomic`; redemption uses `receiptAtomic` and `minimumReceivedAtomic`; a claim response uses boolean `accept`. Funding always uses the fixed tenant payout account as the source and exact required principal. The browser cannot supply program IDs, CPI targets, arbitrary instructions, recipients, fee payers or account lists.

The public operation includes `id`, `walletId`, `actor`, `action`, `nonce`, `state`, `expiresAt`, `lastValidBlockHeight`, `messageSha256`, unsigned `transactionBase64`, simulation budget and expected token deltas. The fully signed bytes remain server-side. The lifecycle is `prepared → signed → broadcast/unknown → finalized/failed`; an unsigned plan whose blockhash has expired can become `expired`. One active operation reserves the tenancy's nonce atomically. Reusing a request ID for the same action returns the existing operation; another action is rejected. A demonstration lane is bounded to 500 operations and then needs operator archival.

For Privy, decode `transactionBase64` into a `Uint8Array` and pass the exact bytes, `walletId`, `feePayer`, `operationId`, human-readable action description, `expiresAt`, and `chain: "solana:devnet"` to the sign-only wallet helper. Return the resulting bytes as base64. The user's wallet must already be a required signer. `walletChain` is **null for localnet** because this Privy integration does not claim localnet support. Localnet execution remains a native/operator test path, not a working Privy browser journey.

Authorization revalidates identity, original wallet recovery, accepted agreement, chain state, nonce, expiry and the **exact actor-signed transaction** in simulation. It verifies the actor's Ed25519 signature, adds only the configured sponsor signature, checks that the actor signature and message remain unchanged, and persists the immutable fully signed bytes and transaction signature **before** any broadcast. A failed storage write prevents broadcast. An ambiguous result retains those same bytes; authorization retries reconcile and can send only the identical persisted transaction. They do not create a replacement transfer or sign again.

The dedicated `retry` endpoint works after a browser reload without requesting another wallet signature. It requires the original operation subject, wallet ID and address, current recovery and accepted agreement, and a verified current deployment. It reconciles first. Only a successful RPC lookup reporting the original signature absent permits rebroadcast, and then only before both the review's `expiresAt` and original `lastValidBlockHeight`, with an unchanged tenancy nonce. Missing receipt details, an unavailable block height, changed nonce or expiry leave the outcome `unknown` and keep the original nonce reserved. Timeout alone never marks a signed operation expired or permits a replacement intent. Already finalized/failed operations return their recorded result. The signed-transaction branch of `authorize` uses the same retry checks. Retries do not sponsor-sign, build a new envelope, or accept caller-supplied bytes through the `retry` endpoint.

Finalized token receipts are checked by raw account, mint, authority and bounded deltas against the persisted message. The finalized tenancy nonce must also have advanced. Claim actions require the corresponding recorded claim/approval phase when observing their immediate resulting nonce, since claim approval itself pays nothing. Missing receipt/state evidence remains `unknown`. Out-of-order polling and sends cannot regress a terminal state. The current RPC snapshot also requires the reserve accounts to remain readable and valid even for a closed tenancy; protocol unavailability can therefore delay history reconciliation.

`reconcileSolanaOperations(store, after?, environment?)` is the read-only job entry point. It scans persisted Solana lanes, processes the configured lane's already signed nonterminal operations and returns `{ available, scanned, reconciled, next }`. It does not issue new signatures or replacement transactions. Run it within the existing bounded reconciliation scheduler; no separate cron is installed here.

## Verification and remaining limits

`node --experimental-strip-types --test src/finance/solana/solana.test.ts src/server/solana-service.test.ts` exercises 14 adapter tests and 18 service tests. The service tests use real Kit Ed25519 signatures and SQLite persistence with deterministic RPC/gateway fixtures. They cover idempotency, nonce collision, replay/expiry, original identity/recovery, arbitrary instruction rejection, substituted message/signature rejection, sponsor preservation of the actor signature, fee plus rent limits, durable-write-before-send, ambiguous retries, retry after reload without signing, expired/unknown lifetime and receipt evidence, claim-state finality, genesis/deployment gates, executable hash/authority and simulation-bank consistency. They do **not** constitute a live provider or browser proof. The separate native suite proves real compiled escrow and KLend execution in LiteSVM.

Personal investing stays outside rental escrow authority. Trading remains explicitly unavailable on this test chain. Jupiter's documented keyless tier permits price-only requests at 0.5 requests/second; the application must rate-limit those reads. Transaction builds require separate server API configuration plus issuer eligibility and a supported reviewed transaction route. A quote is not a fill; scaled xStocks balances are not freely withdrawable cash dividends. No issuer test deployment, live purchase/sale, banking account, cash-out or fiat guarantee is created by these routes.
