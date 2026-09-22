---
status: proposed
---

# Explore native USDC, one Kamino reserve and xStocks on Solana

The Solana track needs a new custody implementation and a complete lending-to-investment route. We propose native USDC in a restricted Rust/Anchor escrow, supply-only lending through one explicitly selected Kamino reserve, and eligible earnings released into the tenant's personal wallet for Jupiter purchases and sales of one eligible xStock. A single reserve and instrument make the authority, accounting and exit path bounded enough to prove before expanding investment choice.

## Considered options

Tenant-wallet lending would simplify integration but would not enforce the tenancy's custody restrictions. A managed allocation vault or several reserves would add allocation and redemption behavior to the first proof. We instead plan narrow, validated escrow calls into one reserve, with separate personal-wallet investment transactions.

## Consequences

- Implement and verify the Rust program and CPI account/authority checks; Solidity code and an EVM fork are not substitutes. The escrow must own its lending receipts and redeem into its own authorized token account.
- Keep native token units, lending receipts and scaled investment exposure distinct. Validate the selected xStock's Token-2022 controls and corporate-action accounting; accumulating exposure does not create a second cash payment.
- The wallet and sponsor model follows proposed ADR 0004. Jupiter orders must remain compatible with its actual signatures and fee payer; the escrow receives no general swap instruction or portfolio authority.
- Match the test environment to the actual reserve, token and route. Devnet program presence and a mainnet indicative quote do not establish an executable devnet lifecycle.

Accept this proposal after the escrow/CPI, receipt redemption, wallet recovery/sponsorship, investment signing and exit proofs. Keep current reserve/mint addresses, SDK choices, token extensions, quote observations and environment limitations in the [Solana implementation report](../SOLANA_STACK_EXPLORATION_2026-09-22.md).

Related: [custody](0003-enforce-custody-in-restricted-escrows.md), [wallet](0004-solana-embedded-wallet-and-separate-fee-sponsor.md), [financial operations](0007-reconcile-financial-operations-in-durable-steps.md), [build acceptance](../HACKATHON_BUILD_SPEC.md#acceptance-scenario).
