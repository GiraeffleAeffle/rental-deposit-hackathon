---
status: accepted
---

# Reconcile financial operations through durable, individually confirmed steps

A deposit release can complete while its subsequent investment fails, and a settlement decision can exist before any payout succeeds. We use persistent operation records with separately authorized and reconciled transaction steps, owned by the shared finance interface and implemented with each chain's native receipts and finality rules. This preserves completed financial effects across retries, server restarts and provider delays without treating the whole user journey as one atomic transaction.

## Considered options

One synchronous HTTP request cannot reliably own completion beyond its lifetime. A single all-or-nothing transaction would couple custody, personal-wallet authority and venue execution; use atomic batches where actually supported, but do not make global atomicity a product assumption. Updating a screen to “paid” after submission would leave unknown or reversed outcomes unresolved.

## Consequences

- Persist intent, amounts, destinations, authorization bounds, operation identity and individual step receipts. Deduplicate submissions and observed effects using application records together with the contract/program or provider's actual replay protections.
- A timeout after submission remains unresolved until chain/provider reconciliation establishes the outcome. EVM replacement/reorg behavior and Solana expiry/confirmation remain explicit in their adapters.
- A completed earnings release survives a failed purchase as identifiable personal cash. Retrying the purchase cannot release those earnings again. Likewise, an approved allocation is distinct from a completed settlement.
- The reconciler can observe and resume authorized work; it does not acquire general spending authority. ADR 0008 records its durable runtime.

Validate this design through interruption, duplicate-notification, expired-quote and partial-completion tests on both adapters. The required records and state transitions live in the [build spec](../HACKATHON_BUILD_SPEC.md#modules-records-and-state); the [shared interface](../PARALLEL_STACK_EXPLORATION_2026-09-22.md#3-the-shared-finance-interface) defines the observable behavior. The implementation and local tests are recorded in ADR 0008. Provider-connected execution remains subject to the separate acceptance gates.

Implementation evidence and remaining connected acceptance gates are recorded in [the status report](../IMPLEMENTATION_STATUS.md) and [ADR 0008](0008-durable-runtime-and-bounded-sponsors.md). Acceptance of this architecture does not assert completed provider or production validation.
