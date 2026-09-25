---
status: accepted for test implementation
---

# Persist native operations and use bounded, separately funded sponsors

The approved parallel build needs to survive browser closure, provider timeouts and duplicate requests. An authenticated user must authorize a specific native operation without giving the application a general wallet signer. We use database-backed operation records, chain-specific signature checks and a fee sponsor with constrained transaction construction.

## Decisions

- Use PostgreSQL in hosted environments and SQLite for local development. Both expose atomic record creation/update and bounded scans. Persist immutable intent, authorization, exact prepared transaction bytes, expiry/nonce and observed receipts before claiming a financial effect.
- Run reconciliation through an authenticated server endpoint and a separate `npm run reconcile` worker invocation. A hosting scheduler must invoke it independently of the browser. The worker observes existing operations; it cannot choose a new financial intent or obtain a tenant signature. Scheduling infrastructure is not provisioned by this change.
- Bind tenancy roles to provider-verified personal wallets. Privy user ownership is checked server-side. Funding additionally requires a recorded recovery challenge proof for the original wallet from another browser and login session. This is not physical-device attestation.
- On Robinhood, authorize only the escrow's fixed EIP-712 action schema. The gas sponsor can relay that signature and cannot change its amount, recipients, nonce or deadline. Persist signed raw transaction bytes before broadcasting and retry identical bytes after an ambiguous result. This implementation does not assume Safe/ERC-4337/Pimlico support. Initial token allowance and personal trade sponsorship remain separate gates.
- On Solana, compile the exact transaction with the actor and a distinct fee payer. Verify the actor's signature against that unchanged message, simulate the intended effect and bound sponsor fees plus account rent before adding the sponsor signature. Pin program provenance, cluster and tenancy accounts. The implemented sponsor is an application service; Kora remains an optional future provider.
- Keep the full illustrative walkthrough in a separate, explicitly labeled demonstration state. Native receipts never book through a fixture reconciler, and synthetic earnings never update a connected escrow.

## Alternatives and consequences

A server-held tenant signing key would simplify automation but grant unnecessary spending authority. A browser-only reducer loses operations on reload and cannot establish an observed chain effect. One synchronous request cannot safely distinguish an unsuccessful broadcast from a broadcast whose response was lost. These alternatives are excluded from the connected flow.

The direct sponsor service adds key management and operational responsibilities. It requires a separately funded fee budget and explicitly enabled sending, with no general transfers from rental security. Ambiguous or expired operations can require operator reconciliation rather than automatic replacement. The current Robinhood confirmation policy is a bounded L2 receipt policy, not a claim of irreversible L1 settlement.

A single configured tenancy per native deployment keeps the first connected proof reviewable. Automated tenancy deployment, real-device wallet acceptance, live investment execution, distributed provider quotas and production operations remain outside the completed local proof. See [implementation status](../IMPLEMENTATION_STATUS.md), [Robinhood operations](../ROBINHOOD_NATIVE_API.md) and [Solana operations](../SOLANA_NATIVE_API.md).
