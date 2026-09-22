---
status: accepted
---

# Enforce rental custody rules in dedicated escrows

A generic tenant/landlord/arbitrator multisig can authorize transfers that bypass rental policy, even if the application normally submits restricted operations. We use a dedicated escrow for each tenancy, implemented through a restricted Solidity contract on Robinhood and a restricted program authority on Solana, enforcing the allowed operations, recipients, claim limits and remaining security. This introduces new custody code to prove, but makes the rental restrictions part of every available money path.

## Considered options

Retaining Safe custody with a comprehensive guard remains possible on EVM, provided it covers owner transactions and all enabled modules. The existing payout method checks caller and recipient allowlisting but does not itself enforce claim amounts or remaining security; it cannot be carried over as proof of those restrictions.

## Consequences

Role wallets authorize escrow actions rather than owning unrestricted rental spending powers. There is no arbitrary call forwarding, recipient substitution or portfolio delegation. Upgrade and emergency powers need a separate authority design; using an upgradeable escrow must not be described as immutable custody.

Validate this design through review of the complete instruction/authority model and proofs of funding, redemption, capped earnings release, agreed settlement and disputed settlement. Include rejection of bypasses, replay, changed assets and excessive payouts. See the [Robinhood report](../ROBINHOOD_STACK_EXPLORATION_2026-09-22.md) and [Solana program design](../SOLANA_STACK_EXPLORATION_2026-09-22.md#3-rental-program-and-accounting-design).

Implementation evidence and remaining connected acceptance gates are recorded in [the status report](../IMPLEMENTATION_STATUS.md) and [ADR 0008](0008-durable-runtime-and-bounded-sponsors.md). Acceptance of this architecture does not assert completed provider or production validation.
