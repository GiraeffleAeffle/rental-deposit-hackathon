# Solana devnet rehearsal

This is the operator handoff for a **test-token** rehearsal, dated 23 September 2026. It does not authorize mainnet writes or claim a deployed escrow, earned yield, or an issuer-backed investment fill. The [native API guide](../app/api/finance/solana/README.md) defines the required manifest and acceptance checks.

## What is ready

- Program ID: `BiwaGavQUsSsg48UPpRAGWoXSiUnzgvdDs7rd8WizvPD`. The reviewed `test-deployment` SBF is 396,536 bytes, SHA-256 `a883a31c32d393c1869c93cbae733536233e98533cf8d56ecfa311c562f7d577`. The Rust program source has not changed since commit `0a5ad7d9ea09d9a13a493b3857e0a411467fbc9e`.
- On the original operator machine, `.testnet-secrets/solana/rental_escrow-keypair.json` and `.testnet-secrets/solana/rental_escrow.so` match that ID/hash. A separate devnet-only deployer key is at `.testnet-secrets/solana/deployer-keypair.json` (public address `JCgJEV37VwWxzd2JqzFNaC847hrtPjQq9TU6c6HHxQao`). These files are ignored by Git; never commit, paste or reuse their private bytes on mainnet.
- The official Agave 4.2.2 macOS ARM CLI was downloaded to `/private/tmp/solana-release/bin/` and its release archive SHA-256 checked against the [Anza release](https://github.com/anza-xyz/agave/releases/tag/v4.2.2). This temporary CLI is not part of the repository. `solana --url devnet genesis-hash` returned the pinned `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`.
- The [read-only reserve probe](../scripts/probe-solana-devnet.mjs) found 21 KLend accounts for Circle test USDC, 17 passing the app's account-state checks. The recent `HRwMj8uuoGVWCanKzKvpTWN5ZvXjtjKGxcFbn2qTPKMW` candidate had about 224 test USDC available in the [snapshot](evidence/SOLANA_DEVNET_RESERVES_2026-09-23.json). [Third-party finalized receipts](evidence/SOLANA_DEVNET_RECEIPTS_2026-09-23.json) show batch refresh and receipt redemption involving it. They do not prove this escrow's exact CPI path.

## Current stop and test budget

The deployer has **0 devnet SOL**. Public CLI airdrop requests for 2 and 1 test SOL both failed with a faucet rate-limit error. The program ID remains undeployed. No app transaction was sent.

At the observed devnet rent schedule, the program account, 396,581-byte ProgramData, one 483-byte tenancy and two 165-byte token accounts total **2.0221956 test SOL** in rent exemption. Deployment transaction fees, buffer behavior, user payout accounts and fee sponsorship add to this. Fund the dedicated deployer with about **3 devnet test SOL** before attempting deployment; recheck the live rent figures and balance first. The [Solana devnet faucet](https://faucet.solana.com/) provides test SOL, and the [Solana CLI reference](https://solana.com/docs/references/solana-cli) documents the programmatic airdrop. Devnet tokens have no real-world value and devnet may reset.

For the first funding exercise, use **10 test USDC**, not the UI's fictional 3,000-unit illustration. [Circle's public faucet](https://faucet.circle.com/) currently offers 20 test USDC per Solana devnet address every two hours. Confirm the received token mint is `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`; a faucet transfer alone does not establish a supported lending or investment flow.

## Once the deployer is funded

Use the local CLI path below on the original operator machine, or install a verified Solana CLI elsewhere. Every command explicitly selects devnet and the dedicated test signer:

```sh
SOLANA_CLI=/private/tmp/solana-release/bin/solana
TEST_DEPLOYER=.testnet-secrets/solana/deployer-keypair.json
TEST_PROGRAM_KEY=.testnet-secrets/solana/rental_escrow-keypair.json
TEST_PROGRAM_SO=.testnet-secrets/solana/rental_escrow.so

"$SOLANA_CLI" --url devnet genesis-hash
"$SOLANA_CLI" --url devnet balance JCgJEV37VwWxzd2JqzFNaC847hrtPjQq9TU6c6HHxQao
shasum -a 256 "$TEST_PROGRAM_SO"
"$SOLANA_CLI" --url devnet --keypair "$TEST_DEPLOYER" program deploy \
  --program-id "$TEST_PROGRAM_KEY" --use-rpc "$TEST_PROGRAM_SO"
"$SOLANA_CLI" --url devnet --keypair "$TEST_DEPLOYER" program show \
  BiwaGavQUsSsg48UPpRAGWoXSiUnzgvdDs7rd8WizvPD
```

Before any app operation, record the finalized Program/ProgramData accounts, exact executable length/hash and upgrade authority. Re-run the native SVM proof if the built artifact, reserve interface or program source changes. A successful deploy alone is not a functioning tenancy.

Then create distinct tenant, landlord and arbitrator Privy accounts, record original wallets and recovery proofs, and accept a single agreement with both tenant and landlord. Precreate their fixed Circle test-USDC token accounts. The existing `buildInitializeEscrow` function requires **tenant and landlord signatures on the same transaction message**, plus a separate rent payer; there is no unattended initialization coordinator. Initialize only a reviewed candidate reserve, then read back its tenancy PDA and set the server-only manifest. Rehearse 10-test-USDC funding, supply and redemption first; only after that test the policy-bounded earnings release and claim/settlement paths. Devnet may not produce useful organic earnings during a hackathon rehearsal, so keep the controlled-accrual SVM proof clearly separate. The issuer xStock route remains unavailable on devnet.
