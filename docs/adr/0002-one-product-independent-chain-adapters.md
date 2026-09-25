---
status: accepted
---

# Use one product with independent chain finance adapters

The user requested parallel exploration of Robinhood Chain and Solana, which have different custody, signature, lending and transaction semantics. We share the role journeys and domain rules, and put each finance implementation behind an intent-level interface: observe, plan, submit and reconcile. Each tenancy is bound to one network and deposit asset; independent implementations avoid introducing a bridge or cross-chain security obligation into the first product.

## Considered options

Two separate applications would duplicate the product and make their outcomes harder to compare. A shared low-level transaction implementation would hide differences that matter for authorization, accounting and finality. The selected interface shares product intent while keeping native signing and evidence explicit.

## Consequences

The implementations must pass the same acceptance scenario. Chain selection cannot move funds or reinterpret an existing tenancy, and the domain must not use an EVM Safe address as its universal custody identity. This accepts the structure of the exploration, not a final production chain or a promise to ship both implementations by the deadline.

See the [interface constraints](../PARALLEL_STACK_EXPLORATION_2026-09-22.md#3-the-shared-finance-interface) and [build spec](../HACKATHON_BUILD_SPEC.md).
