---
status: proposed
---

# Explore USDG, Morpho and Stock Tokens on Robinhood Chain

The Robinhood track needs to prove the full deposit-to-investment lifecycle while reusing the existing Solidity and application work. We propose USDG rental security in the restricted escrow from ADR 0003, a supply-only Morpho USDG vault position, and eligible earnings released into the tenant's personal USDG wallet for secondary-market Stock Token purchases and sales. This tests the chain's lending and investment stack without first adding a euro banking and currency-conversion integration.

## Considered options

Recreating the Gnosis EURe banking flow would add provider and conversion dependencies before proving the investment step. Base/Aave/Dinari remains an alternative EVM track if the Robinhood route fails its proof gates; proposing this stack does not select Robinhood over Solana or Base for production.

## Consequences

- Reuse Solidity tooling and reviewed tenancy rules, but replace Aave calls and aToken assumptions with Morpho asset/share conversion and version-specific liquidity and gate checks. The observed vault's zero `max*` views cannot stand in for executable liquidity.
- The proposed Stock Token venue is an eligible 0x RFQ route, subject to actual access. Account for the instrument's exposure multiplier and distinguish a sale from a cash distribution; no separate cash dividend is invented.
- Prove the Safe/passkey, recovery and supported sponsorship combination for the actual caller. Existing Pimlico configuration alone does not establish compatibility. Stock Tokens remain in the personal wallet, outside escrow and arbitration authority.

Accept this proposal only after the applicable route-access, escrow, signing, small-order economics and exit proofs. Exact token addresses, vault version, access restrictions, source blocks and RH-1–RH-5 checks remain in the [Robinhood implementation report](../ROBINHOOD_STACK_EXPLORATION_2026-09-22.md); they are observations or implementation prerequisites, not frozen constants in this decision.

Related: [custody](0003-enforce-custody-in-restricted-escrows.md), [financial operations](0007-reconcile-financial-operations-in-durable-steps.md), [build acceptance](../HACKATHON_BUILD_SPEC.md#acceptance-scenario).
