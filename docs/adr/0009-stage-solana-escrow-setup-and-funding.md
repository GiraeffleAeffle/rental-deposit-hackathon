---
status: accepted for the next test implementation
---

# Stage Solana escrow setup and funding

The current Solana program requires tenant and landlord to sign the same short-lived initialization transaction. The devnet rehearsal showed that coordinating two browsers within its blockhash lifetime is too fragile for a normal rental journey. For the next test deployment, the landlord alone will authorize creation of an empty escrow after both parties accept the same recorded agreement; the tenant will later review its exact on-chain terms and separately authorize funding. The fee sponsor pays setup rent and fees but cannot fund, release, or redirect security.

The prepared escrow is not a funded deposit. It must remain in `awaiting-funding` with zero tracked principal until the tenant's exact funding transaction finalizes. The tenant's acceptance is a recorded, provider-verified agreement action, while the tenant's later on-chain funding signature is the custody action. Before offering funding, the application must compare the program, genesis, immutable parties, asset, payout accounts, required security, and policy hash with the accepted agreement. The landlord cannot change those values after setup. A tenant who disagrees can decline to fund; an unfunded escrow must never appear as active security.

This replaces the joint-signature onboarding for **new** test tenancies only. Existing devnet tenancies and their pinned program remain on the joint-signature version. Use a separate program deployment and a manifest that explicitly selects staged setup; never infer the mode from UI state or silently upgrade the funded program. Continue to reconcile prepared, submitted, and finalized transactions before permitting the next step.

## Considered options

A durable nonce could give both people more time to sign the same transaction, but would keep a shared pending transaction and add nonce-account coordination and recovery. Keeping recent blockhashes with automatic retries would still ask both people to repeat signatures. Staging the two custody actions matches the human workflow and the existing tenant-only `fund` instruction, at the cost of a second reviewed deployment and clear treatment of an empty escrow.
