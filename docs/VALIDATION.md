# Prototype validation

Validated September 21, 2026. This evidence concerns the new interface and local simulation only.

| Check | Result |
| --- | --- |
| `npm test` | 6 tests pass: accounting, agreement and dispute paths, role restrictions, allocation limits, repeat payout, exact cents, retained tenant statement, and savings assumptions. |
| `npm run lint` | TypeScript and Next/React ESLint checks pass. |
| `npm run build` | Next.js 16.3.5 production build passes. |
| Dependency installation audit | No known vulnerabilities reported by npm for the pinned dependency tree at installation time. Not a security audit. |
| Browser: agreed path | Tenant acceptance creates a recorded allocation while the $800 stays held. |
| Browser: disputed path | Tenant requests review; a reason is required for an arbitrator decision; an allocation above the $120 claim is blocked. |
| Browser: payout | A $60/$740 sample allocation pays only after a recorded decision. Held portfolio total drops from $2,000 to $1,200; the unfunded $800 request remains separate. |
| Browser: records and calculators | Sample dialog opens/closes, savings input updates the projection, and mobile navigation reaches the deposit comparison. |
| Responsive layout | Measured DOM widths of 390 and 320 CSS pixels show no horizontal page overflow; all three role overviews checked at 320. |
| Browser console | No captured errors or warnings in the reviewed flows. |

Desktop appearance was visually inspected. The in-app browser's viewport screenshot output showed rendering artifacts during phone emulation, so mobile visual verification is limited to DOM geometry and interactive checks; repeat on a physical phone before submission.

TypeScript is pinned to 6.0.3 because the current TypeScript ESLint integration does not support the TypeScript 7 API. ESLint is pinned to 9.39.5 because Next's bundled React plugin fails against ESLint 10. Revisit these toolchain pins when upstream compatibility is available.

No blockchain, real bank account, private evidence storage, authentication, investment eligibility, statutory workflow, or real-money custody was tested. Those systems are not implemented in this repository.
