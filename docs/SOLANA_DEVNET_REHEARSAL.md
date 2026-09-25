# Solana devnet rehearsal

This records the 23–24 September 2026 **test-token** proofs. An operator-key tenancy completed a no-claim custody cycle against a real Kamino devnet reserve. One Privy-connected application tenancy initialized, funded and supplied 10 test USDC and remains active. Another Privy-connected tenancy on the [separately verified staged program](evidence/SOLANA_STAGED_DEVNET_DEPLOYMENT_2026-09-24.json) completed the full no-claim cycle and returned 10 test USDC to the tenant. These runs do not establish earned yield, a tokenized-stock purchase or production readiness. See the [original deployment](evidence/SOLANA_DEVNET_DEPLOYMENT_2026-09-23.json) and [operator transaction evidence](evidence/SOLANA_DEVNET_ESCROW_REHEARSAL_2026-09-23.json).

## Verified deployment

- Genesis: `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG` (devnet). Program: `BiwaGavQUsSsg48UPpRAGWoXSiUnzgvdDs7rd8WizvPD`; ProgramData: `vTpKFXjSPtkVmLKHKAJZK6jzaS2PC7tc6pvVXtVUJ5V`.
- The current `test-deployment` SBF is **397,336 bytes**, SHA-256 `03193455b06f9ee8c6f96ff5504f5fb97fb3ed839164676e3e9afcec55ca4377`. The dedicated upgrade authority is `JCgJEV37VwWxzd2JqzFNaC847hrtPjQq9TU6c6HHxQao`. The upgrade finalized at slot `502957809` ([signature](https://explorer.solana.com/tx/2YX6cLE6WSmsuLVwt6j3dPy9QRcGZyiv4oHvQiqgeFoBs61iRM5UaXMV3UXZWVPmhXD9nyP2omP8MkyZ2FPDYvYy?cluster=devnet)). The app's `verifyDeployedProgram` checked the finalized loader, authority, exact executable bytes/hash and zero padding after the upgrade.
- An initial 396,536-byte build was deployed at slot `502952030`. Its supply simulation exposed a real integration defect: the pinned Kamino interface forwarded `nu111...`, KLend's absent-oracle sentinel, as a configured Switchboard account. KLend rejected `RefreshReserve` with `InvalidSwitchboardAccount`; **no supply transaction was sent from that build**. The current source omits that sentinel for the optional refresh accounts and the off-chain reserve manifest. Nine Rust host tests, three LiteSVM execution tests and 32 Solana client/service tests passed after the fix.
- The selected Circle test-USDC mint is `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`; the KLend reserve is `HRwMj8uuoGVWCanKzKvpTWN5ZvXjtjKGxcFbn2qTPKMW`. Its market, vault, receipt mint, authority and one real Scope oracle are pinned in the deployment evidence. The [fresh read-only probe](evidence/SOLANA_DEVNET_RESERVES_2026-09-23.json) still found 21 test-USDC reserves, 17 passing the account checks. Reserve state can change, so the script revalidates it before every action.

The user supplied 10 devnet SOL to the dedicated deployer. Circle's [test faucet](https://faucet.circle.com/) sent 20 test USDC to the separate operator tenant, and the transfer finalized. Operator tenant, landlord and arbitrator keys live only in ignored, mode-0600 local files; they are **not** the user's Privy wallets. The original and upgraded `.so` files are likewise preserved only under `.testnet-secrets/solana/` on the operator machine. The official Agave 4.2.2 CLI was verified against the [Anza release](https://github.com/anza-xyz/agave/releases/tag/v4.2.2) and used for deployment. The public RPC rate-limited RPC-only upload; the successful uploads used a persistent local buffer key and the TPU client.

A separate app fee sponsor, `7h3dQn7ZSaq21MsaQYCYVruESdLH2DjnBK9FbUKieaDY`, received 0.05 **devnet** SOL from that deployer in [finalized transaction `26prDct...`](https://explorer.solana.com/tx/26prDctbi9NbqVwteCZpWVStcFxxpmmEq3QQi3JSxvxUwAFv18NA8RdJ5h2XgFMj7kksZaUJ5vFR1P9GW6oLd7q5?cluster=devnet). Its private key is in the ignored local test-key directory and server-only environment. It later sponsored the Privy application custody transactions.

A fresh **unsigned, unbroadcast** initialization for the operator parties passed the new app preflight and exact devnet simulation using that sponsor. The 947-byte transaction estimated a conservative **6,110,760-lamport sponsor ceiling**, including a 15,000-lamport network fee, below the app's 10,000,000-lamport per-action cap. This checks live rent/program compatibility; it is not a new tenancy or a Privy signature proof.

## Finalized custody cycle

The operator tenancy `BJ4xahTU26gmKE843Go9VU2segQjZTdyTEXHRfXX1wdW` fixed distinct tenant and landlord signers, a separate payer, a 10-test-USDC security requirement, and their fixed payout accounts. Every action was simulated against the current deployment before being sent. The [receipt file](evidence/SOLANA_DEVNET_ESCROW_REHEARSAL_2026-09-23.json) includes each finalized signature, slot, fee, compute use and native/KLend instruction log.

| Step | Onchain result |
| --- | --- |
| Initialize and fund | Tenant and landlord jointly signed initialization; tenant deposited exactly 10 test USDC. |
| Supply | `RefreshReserve` and `DepositReserveLiquidity` succeeded through this escrow's CPI; it held 10 million receipt units. |
| Redeem | `RefreshReserve` and `RedeemReserveCollateral` returned 10 test USDC to escrow cash. |
| Close | Landlord proposed a **zero** claim, tenant accepted it, and settlement returned all 10 test USDC to the tenant. |

At finalized slot `502959454`, the escrow was `closed`, nonce `6`, with **zero tracked and actual cash and receipt balances**. The tenant test token account held its original 20 USDC; the landlord account held zero. The seven custody transactions incurred 75,000 test lamports in transaction fees, excluding program and account rent. There was no organic yield, surplus release, disputed claim or investment order.

## Privy-connected application milestone

Three distinct Privy accounts joined a locally persisted agreement as tenant, landlord and arbitrator. The tenant and landlord accepted the same security and earnings-release terms and each signed the exact initialization message through their own embedded Solana wallet. The separate fee sponsor submitted it; a finalized receipt and the escrow account matched the agreement. The tenant then signed a 10-test-USDC funding transaction and a 10-test-USDC supply transaction through the app. Both finalized with independently checked token deltas. After supply, the escrow had zero cash and **10 million Kamino receipt units**, valued at **10 test USDC** at the observation slot; its next operation nonce was `2`.

That first application tenancy remains active with 10 million receipt units. A second accepted agreement used the staged program: the landlord created an empty escrow alone, the tenant funded exactly 10 test USDC, supplied it to Kamino and later redeemed it. The landlord proposed a zero-dollar claim, the tenant accepted it, and settlement returned the full deposit. At finalized slot `503502948`, independent reads found `closed` state, zero escrow cash/receipts, 10 million atomic test-USDC units at the tenant's fixed payout account and zero at the landlord's. The first funded tenancy was independently rechecked afterward and remained active.

Application receipts and wallet addresses remain in ignored local records, not in the public evidence files, because publishing them would link the user's Privy accounts. Neither application position has earned a measured surplus. Earnings release, a disputed claim and a personal investment order have not been completed with these Privy accounts. The finished operator-key custody cycle above is separate evidence.

## Rehearsal command and connected follow-up

The [operator script](../scripts/rehearse-solana-devnet.mjs) defaults to simulation. It pins devnet genesis, exact program code hash and authority, reserve and token-account identities; signs only with the ignored local test keys; stores any sent transaction bytes locally before broadcast; and refuses a new action while its prior signature is unresolved. `--send` is required to broadcast. On the original operator machine, the sequence was:

```sh
node --experimental-strip-types scripts/rehearse-solana-devnet.mjs initialize --send
node --experimental-strip-types scripts/rehearse-solana-devnet.mjs fund --send
node --experimental-strip-types scripts/rehearse-solana-devnet.mjs supply --send
node --experimental-strip-types scripts/rehearse-solana-devnet.mjs redeem --send
node --experimental-strip-types scripts/rehearse-solana-devnet.mjs propose_no_claim --send
node --experimental-strip-types scripts/rehearse-solana-devnet.mjs accept_no_claim --send
node --experimental-strip-types scripts/rehearse-solana-devnet.mjs settle --send
node --experimental-strip-types scripts/rehearse-solana-devnet.mjs status
```

The recorded operator tenancy is closed; these commands do not create another one from the same local state. The script is pinned to the public addresses in its deployment evidence, so another operator must review and replace those addresses and provide their own matching ignored test keypairs before using it. `SOLANA_TEST_KEYS_DIR` selects that local key directory. Never commit keypairs, signed pending transactions or server secrets.

For a **new application** agreement, create separate Privy tenant, landlord and arbitrator accounts and accept the terms with the actual original wallet identities. Precreate the tenant and landlord associated test-USDC payout accounts, derive the new tenancy PDA from the agreement ID and tenant wallet, and configure `SOLANA_DEPLOYMENT_MANIFEST` with the pinned deployment plus that `agreementId` and `tenancyAddress`. The original program uses joint setup signatures; the separately verified staged program uses explicit `setupMode: "staged"`, letting the landlord sign empty-escrow creation and the tenant fund later. Verify the setup receipt and initialized account before funding. The issuer xStock route is not available on this devnet proof; personal buy/sell, eligibility and investment-proceeds withdrawal remain separate gates.

After both parties accept, the local operator can run [`prepare-solana-app-payouts.mjs`](../scripts/prepare-solana-app-payouts.mjs) with the agreement ID. It checks the pinned devnet, exact party-owned test-USDC accounts and sponsor debit ceiling, then simulates an idempotent account-creation transaction. The default invocation only simulates; append `--send` to have the separate test sponsor create missing accounts and wait for finalized receipts. The script never signs with a tenant or landlord wallet and refuses an unaccepted agreement.

If the accepted Privy tenant needs faucet tokens for the later funding action, [`fund-solana-app-tenant.mjs`](../scripts/fund-solana-app-tenant.mjs) can move exactly 10 **devnet test USDC** from the pinned, separate operator faucet account to that tenant's own derived token account. It checks the accepted agreement, genesis, mint, source and destination ownership, current balances and sponsor cost; the default invocation only simulates. Append `--send` to transfer test tokens, save the exact signed transaction locally before broadcast and verify the finalized balance change. It never signs with a Privy wallet and does **not** fund escrow; the tenant must separately review and sign the app's funding action.
