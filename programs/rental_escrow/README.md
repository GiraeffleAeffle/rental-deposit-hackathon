# Restricted Solana rental escrow

This prototype has a real Anchor program and a restricted Kamino supply/redemption CPI path. It is **not deployed**. Default builds reject initialization; `test-deployment` permits only Circle's devnet test USDC mint and deposits up to 10,000 test units. There is no mainnet-write feature.

The test program ID is `BiwaGavQUsSsg48UPpRAGWoXSiUnzgvdDs7rd8WizvPD`. `Anchor.toml` selects localnet. A generated deployment key exists only in the task's temporary build directory and must never be committed. The client requires an explicit deployment manifest, genesis hash and reviewed program hash before it can plan test-network writes.

| Action | Authority and result |
| --- | --- |
| Initialize | Tenant and landlord both sign the fixed parties, payout accounts, reserve, principal, release flag and policy hash. A separate payer funds account rent. |
| Fund | Tenant transfers the exact required test USDC principal to the cash PDA. |
| Supply | Tenant authorizes an input cap. The program refreshes the reserve and supplies cash through KLend. Observed cash spent and receipt tokens received update the ledger. |
| Redeem | Tenant while active; a recorded party while settling. Receipts can redeem only to escrow cash, with a minimum received amount. |
| Release earnings | Tenant, active tenancy, agreed release policy, current reserve valuation and realized cash surplus. The fixed tenant payout account is the only destination. |
| Claim | Landlord proposes a bounded claim; tenant accepts or disputes it. Only the preassigned arbitrator decides disputed claims. Approval moves no tokens. |
| Settle | After every tracked receipt has been redeemed, approved cash goes to the fixed landlord account and remaining cash to the fixed tenant account. The tenancy closes permanently. |

All amounts are raw token units (`u64`, six decimal places for the deposit asset). A tenancy owns a PDA cash token account and PDA receipt token account. A monotonically increasing on-chain nonce rejects repeated operations. The program cannot borrow, swap, choose arbitrary CPI targets, access a personal investment portfolio, or change payout recipients. Unsolicited token transfers are excluded from its ledger; they cannot become releaseable earnings. Account closure and recovery of unattributed donations are intentionally absent from this prototype, which avoids reopening a tenancy or assigning someone else's tokens.

Kamino's receipt conversion uses a 60-bit fixed-point fraction and 256-bit intermediate arithmetic. Valuation subtracts protocol, accumulated referral and pending referral fees. Conversions floor; missing liquidity is a failure, not a promise of instant withdrawal. KLend may spend one atomic unit less than the requested supply amount to mint whole receipts. The program retains and accounts for that dust. Security is denominated in the agreed token; this is not a guarantee of its fiat exchange value.

The unmodified `klend-interface` dependency is pinned to Kamino commit `a08760976f51a3a58c4a0c6ea27b4a0e565bca79` (interface 0.8.0); see its upstream license. The CPI uses the official low-level refresh/deposit/redeem builders. Established reserves can have vault/mint addresses that differ from the latest new-reserve PDA convention. Both addresses are therefore pinned to fields in the KLend-owned reserve account; the market authority is additionally derived and checked. Token account owners, token program, decimals, mint, reserve/market identity, status, permissions, reserve freshness and token deltas are validated.

Run the lightweight checks from the repository root:

```sh
cargo fmt --all --check
cargo test --workspace --features test-deployment
node --experimental-strip-types --test src/finance/solana/solana.test.ts
```

The SVM tests are explicitly ignored by the default host command because they require compiled programs and a public snapshot. Execute them separately:

```sh
cargo build-sbf --manifest-path programs/rental_escrow/Cargo.toml --features test-deployment --sbf-out-dir /tmp/rental-sbf
python3 programs/rental_escrow/scripts/download_fixture.py --out /tmp/rental-kamino-fixture
RENTAL_ESCROW_SBF=/tmp/rental-sbf/rental_escrow.so KAMINO_FIXTURE_DIR=/tmp/rental-kamino-fixture cargo test --features test-deployment --test svm -- --ignored
```

The download script uses read-only mainnet RPC calls to fetch the KLend executable, one reserve, its market, clock and configured oracle accounts. It writes program hash and snapshot slot provenance. It creates no wallet and sends no transaction. The test harness substitutes the test USDC mint and locally constructs test token accounts. A separate controlled-accrual fixture changes reserve liquidity and its matching token balance to exercise earnings release. These tests prove execution against a real protocol binary in a local SVM with test state; they are not a mainnet transaction, production reserve proof, prediction of returns or deployed devnet integration.

Verified on 2026-09-22:

- 8 host tests: fixed-point rounding/overflow bounds, fee buckets, policy/shortfall rules, claim authority/limits/nonces, and client account-layout compatibility.
- 3 LiteSVM integration tests using the compiled escrow and real KLend SBF: authority/claim/recipient/nonce/settlement; refresh→supply→redeem with receipt rounding, insufficient liquidity and slippage rollback; 3,000-unit funding→controlled 10-unit earnings release→120-unit claim→2,880-unit security return, preserving the previously released 10 units.
- 14 TypeScript tests and TypeScript/ESLint checks: network/asset gates, issuer extensions, binary account decoding, transaction construction, quote eligibility/expiry/fees, encoded Metis amount bounds, exact-message simulation review and finalized token-delta reconciliation.
- SBF build: `cargo-build-sbf 4.3.0`, platform-tools `v1.57`, Anchor `0.32.1`; no container or local validator. Escrow artifact SHA-256: `a883a31c32d393c1869c93cbae733536233e98533cf8d56ecfa311c562f7d577`.
- Public KLend snapshot: slot `449444994`; executable SHA-256 `9db16dd4b7bbfe4f13df850bf880bfc4522fcece06717c0626d625746a3cc85b`. Future upgraded binaries require another proof run.

The separate TypeScript adapter lives in `src/finance/solana`. It exposes read, plan and reconcile helpers, leaving identity, signatures, sponsoring, persistence and broadcasting to the application. It never treats a quote, provider success string, receipt share count or scaled display balance as cash settlement. Jupiter reads/builds require server-side API configuration. The narrow transaction reviewer supports exact-input, single-hop Whirlpool Metis routes; unknown variants, extra hook accounts, opaque added instructions and unreviewed issuer extensions fail closed. This is deliberately not a claim of universal Jupiter route support.

Production and deployed-demo gates remain: a reviewed test reserve deployment; deployed escrow code/upgrade authority verification; sponsor-backed wallet recovery and complete browser journeys; durable operation reconciliation; live quote/simulation/execution proof for the approved venue; protocol upgrade monitoring; policy/claim timeout handling; security review; and a separate issuer eligibility decision. SPYx represents economic exposure, not direct shareholder rights. Token-2022 scaling can reflect accumulated distributions; it is not a cash dividend. There is no verified matching xStocks/Jupiter devnet route, and this adapter does not enable mainnet purchases or sales. Issuer permanent-delegate/pause/transfer-hook controls remain distinct from this escrow's landlord/tenant permissions.

Sources: [Kamino interface](https://github.com/Kamino-Finance/klend/tree/a08760976f51a3a58c4a0c6ea27b4a0e565bca79/libs/klend-interface), [Solana program builds](https://solana.com/docs/programs/deploying), [LiteSVM](https://github.com/LiteSVM/litesvm), [Jupiter order and execute](https://developers.jup.ag/docs/swap/order-and-execute), [Jupiter route ABI](https://github.com/jup-ag/jupiter-amm-implementation/blob/main/idls/jupiter_aggregator_v6.json), [xStocks asset metadata](https://api.xstocks.fi/api/v2/public/assets/SPYx).
