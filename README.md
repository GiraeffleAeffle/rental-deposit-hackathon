# Deposit workspace

A new rental deposit product taking shape: shared records for tenants, landlords, and human arbitrators, with a separate path toward personal savings.

**Status: interactive product prototype.** All people, homes, balances, records, and transactions are fictional. No bank, wallet, investment account, authentication service, or blockchain is connected. The product name and chain decision remain open. `rental-deposit-hackathon` is a temporary repository label, not the brand.

## Try it

Use Node.js 22.18+ or Node.js 24 LTS.

```sh
npm ci --ignore-scripts
npm run dev
```

Open `http://127.0.0.1:3000`.

1. Start as **Tenant** and open the $120 claim against an $800 deposit.
2. Read the sample condition records. Agree to the deduction, or request human review.
3. Switch to **Landlord** to see held funds separately from unfunded requests and pending claims.
4. For a disputed claim, switch to **Arbitrator**, enter an allocation and a reason, and record the decision.
5. Simulate the agreed payout and download the sample settlement record.
6. Explore a personal savings plan or compare a deposit, installments, and a monthly-fee alternative.

The role switch is a demonstration tool, not access control. State is held in memory and resets on reload. Do not enter personal data.

## What is implemented

- Responsive three-role workspace with a single shared case state.
- Pending claim → agreement or dispute → reasoned human decision → simulated payout.
- Exact integer-cent accounting and fixed allocation totals; requested money is excluded from held balances.
- Sample records, activity history, and a downloadable fictional ledger.
- Personal savings illustration that starts at zero and excludes the held deposit.
- Comparison of refundable deposits, no-fee installments, and an illustrative monthly-fee alternative.
- Local fonts and artwork; no third-party tracking or external font requests.

## What is not implemented

Real signing, custody, interest accrual, investment execution, identity verification, private documents, statutory deadlines, appeals, account recovery, provider onboarding, and production operations are still future work. There is no deployable custody contract in this repository. The state reducer is not a financial authorization boundary.

The current recommendation is **Solana for a focused Colosseum entry**, balancing its $100,000 track pool against a broader ecosystem. **Base or Arbitrum** preserve more Solidity/Aave/Safe work with $25,000 pools. **Tempo** remains a credible payments option and has Morpho deployments, but is not automatically the best fit for the ownership vision. A final choice has not been made. See [the decision brief](docs/MARKET_AND_CHAIN_DECISION.md).

## Validate

```sh
npm test
npm run lint
npm run build
```

The tests cover the simulation's balance accounting, role transitions, allocation limits, repeated payout prevention, exact money parsing, and savings assumptions. They do not establish production security or legal compliance.

## Project map

- `app/` — Next.js app, metadata, and responsive styles.
- `src/components/workspace.tsx` — role-based product experience.
- `src/domain/rental.ts` — demonstration state transitions and money calculations.
- `src/domain/rental.test.ts` — meaningful tests for accounting and authorization-like simulation rules.
- `docs/` — market research, architecture, and the next implementation slices.

## Prior work and hackathon provenance

This project grows out of the earlier **Smart Rental Deposit** Gnosis prototype. That work predates the competition and informed the domain and product exploration. This repository is a new implementation of the interface and simulation, prepared on September 21, 2026. It does not copy the previous app's backend, environment files, tenant records, keys, git history, or launch claims.

The prior local checkout was at `07573bd3fa66f1af6c99b2d264af39ee767154a3` (May 10, 2026), with additional uncommitted work. That is a review reference, not a complete September 14 baseline. Disclose all pre-existing work in the submission and identify the actual competition-period changes. A new repository alone does not make an old project newly eligible. [Colosseum rules](https://colosseum.com/legal/Crypto%20World%27s%20Fair%20Hackathon%20Rules.pdf).

No submission, registration, partner approval, or real-money deployment has been performed. Public source visibility is not a license decision; a project license remains to be chosen.
