# Market and chain decision

Research date: September 21, 2026. This is product research, not legal clearance for a launch.

## Recommendation

Build a deposit administration and settlement product whose paying customer is a property manager. Treat an optional personal wealth account as a later, separate product surface. Validate a single US market before committing to a US launch. Do not promise that deposit yield will make a typical renter a property owner.

For the competition, a dedicated ecosystem track is now a requirement. Gnosis is therefore excluded from the new entry. The current recommendation is **Solana**, provided the scope is one testnet escrow lifecycle and the team accepts an on-chain rewrite. The user has not selected a final chain. The brand remains undecided.

## Chain comparison

| Chain                  | Dedicated awards       | Product fit                                                                                                       | Engineering consequence                                                                                                |
| ---------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Solana                 | $100,000: 10 × $10,000 | Best candidate among the larger pools for combining payments with an established broader consumer/DeFi ecosystem. | Rebuild escrow and signing with Solana-native tooling. Reuse React, TypeScript, product rules, and evidence workflows. |
| Base                   | $25,000: 5 × $5,000    | Strong US consumer and EVM option; native USDC and Aave.                                                          | Preserve more Solidity and integration knowledge, but revalidate deployments and custody.                              |
| Arbitrum               | $25,000: 5 × $5,000    | Strong EVM lending infrastructure; native USDC and Aave.                                                          | Closest to existing EVM work; prior Arbitrum Sepolia code is not mainnet proof.                                        |
| Tempo                  | $100,000: 10 × $10,000 | Purpose-built payments, native passkeys and fee sponsorship; Morpho is now deployed.                              | Solidity reuse helps, but token availability, wallets, liquidity, and provider integrations require separate checks.   |
| Hyperliquid / HyperEVM | $100,000: 10 × $10,000 | EVM and finance capabilities; no verified advantage for this rental workflow.                                     | Another provider/infrastructure validation effort.                                                                     |
| Zcash                  | $100,000: 10 × $10,000 | Privacy could matter, but no validated route to the deposit/ownership stack.                                      | Larger product and integration change without a demonstrated benefit here.                                             |

The larger pools do not imply better odds; entrant quality and judge preferences are unknown. Ethereum L1 and Robinhood Chain also have $25,000 pools. General prizes are separate. Submission closes October 12 at 23:59 Pacific (October 13, 08:59 Berlin). [Official awards](https://colosseum.com/worldsfair), [rules](https://colosseum.com/legal/Crypto%20World%27s%20Fair%20Hackathon%20Rules.pdf).

Evidence for ecosystem fit:

- Circle's September 16 list includes native USDC on Solana, Base, and Arbitrum; Tempo is absent. This does not mean Tempo lacks other stablecoins. [Circle](https://www.circle.com/usdc).
- Kamino offers lending and curated lending vaults on Solana. Integration availability is not a guarantee of principal, yield, or withdrawal liquidity. [Kamino](https://kamino.com/lend/).
- Aave lists both Base and Arbitrum deployments. [Aave](https://aave.com/help/aave-101/accessing-aave).
- Morpho's official addresses include Tempo core and vault contracts. It would be inaccurate to describe Tempo as having no lending ecosystem. Contract availability alone does not verify a suitable liquid market. [Morpho](https://docs.morpho.org/developers/contracts/addresses/).
- Tempo advertises native payment features and is EVM-compatible. The earlier recommendation for it emphasized prize pool and reuse; the broader ownership ambition increases the weight on ecosystem breadth. [Tempo](https://tempo.xyz/), [implementation](https://github.com/tempoxyz/tempo).
- Colosseum's accelerator investment focus remains Solana. This does not guarantee an investment or prize. [Colosseum announcement](https://blog.colosseum.com/expanding-the-arena/).

## US deposit interest is state- and sometimes city-specific

There is no single answer for all US rentals. A lease, property category, duration, subsidy status, and local law can change the result.

| Example       | Tenant's interest entitlement and custody implications                                                                                                                                                                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New York      | For buildings with six or more apartments, deposits must be in an interest-bearing New York bank account. The tenant receives interest above the permitted annual administrative amount of 1% of the deposit. Voluntarily interest-bearing deposits in smaller buildings also carry interest obligations. Tenants can choose annual payment, rent application, or payment at the end. |
| Massachusetts | Requires a separate interest-bearing account at a Massachusetts bank. For deposits held at least a year, the rule is 5% annually or the lower interest actually received from the bank, payable annually. It is not a guaranteed 5% product return.                                                                                                                                   |
| Florida       | Offers prescribed holding methods: separate non-interest account, separate interest-bearing account, or a qualifying surety-bond route. With an interest-bearing account, the tenant is owed at least 75% of its annualized average rate or 5% simple interest, as elected by the landlord. The bond route has its own 5% rule.                                                       |
| Texas         | The statewide residential-deposit provisions do not impose a general interest-payment requirement. They do impose refund, accounting, and deduction rules. Local requirements and lease promises still need review. Absence of a statewide interest rule is not approval for stablecoin custody.                                                                                      |

[New York Attorney General](https://ag.ny.gov/resources/individuals/tenants-homeowners/tenants), [Massachusetts statute](https://www.mass.gov/info-details/mass-general-laws-c186-ss-15b), [Florida statute](https://www.leg.state.fl.us/Statutes/index.cfm?App_mode=Display_Statute&URL=0000-0099/0083/Sections/0083.49.html), [Texas Property Code, Subchapter C](https://tcss.legis.texas.gov/resources/PR/htm/PR.92.htm).

City rules matter too: San Francisco has its own security-deposit interest provisions. [City code](https://www.sf.gov/sites/default/files/2022-11/903%20Security%20Deposit%20Interest%20Ch.%2049.pdf).

**The US is not a shortcut around deposit law.** A USDC escrow or lending position is not automatically the bank account a statute requires. Real-money design needs state-specific advice on custody, segregation, deductions, annual interest, dispute authority, deadlines, stablecoins, money transmission, and any investment distribution. Do not assume a private arbitrator can replace statutory remedies or that a smart contract overrides a court.

Texas is a candidate for initial property-manager interviews, not an approved launch jurisdiction. New York is potentially interesting for a bank-based product that gives tenants visibility and an annual-interest choice, but it does not justify moving required bank-held security into DeFi. The demo's fictional Austin address is not a compliance claim.

## Deposit alternatives solve a different problem

| Structure                          | What monthly payments do                                         | Typical end result                                                                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Refundable deposit in installments | Build the actual deposit over an agreed schedule.                | Funded principal remains refundable, less lawful deductions; interest depends on the applicable rules. Financing costs may exist in a loan-funded product. |
| Surety/premium alternative         | Pay for a product protecting the property owner.                 | Premiums may be nonrefundable and the tenant may still have to reimburse claims.                                                                           |
| Payment-authorization alternative  | Pay for avoiding upfront collateral and authorize later charges. | Fees do not build a deposit; damage or missed-rent liability remains.                                                                                      |

Rhino explicitly says premiums are not returned and renters must reimburse claims paid on their behalf. Obligo says its service is not insurance, charges a fee, and can bill the tenant for approved landlord charges, with interest-free repayment installments available. These products can provide useful liquidity; they are not equivalent to a refundable savings balance. [Rhino](https://support.sayrhino.com/hc/en-us/articles/48332083927700-What-is-Rhino-s-Security-Deposit-Alternative-and-how-does-it-work), [Obligo](https://help.myobligo.com/en/articles/4404457-how-does-obligo-s-no-deposit-service-work).

The prototype compares an assumed $800 refundable deposit against an assumed $15 monthly alternative over 24 months: $360 in nonrefundable fees. If the deposit earns a hypothetical 3% simple annual return payable to the tenant, it earns $48 before fees/tax. This is not a provider quote. The alternative leaves the original $800 available to the renter, and they could also save or invest it. A fair comparison must include that opportunity, affordability, claims, and all fees.

Installments are compatible with the product vision. They help with initial affordability while gradually creating refundable collateral. They do not give the landlord full cash collateral on day one unless someone funds or guarantees the shortfall. That credit/insurance function should not be invented inside the hackathon.

## The ownership story and business economics

Zillow's 2025 report gives a roughly $800 median recent-renter deposit: its text says $795, while the table gives $800 among renters who paid one. At an illustrative 3%, $800 produces $24 a year. A 15% share of that yield is only $3.60 annual gross revenue per tenancy. That does not support a high-service business by itself. [Zillow research](https://www.zillow.com/research/renters-housing-trends-report-2025/).

The Census Bureau's 2024 ACS supplemental housing-tenure table reports approximately 46.1 million renter-occupied homes. That is a household count, not a verified deposit balance or attainable revenue pool. Avoid multiplying a median recent-mover deposit by every renter and presenting it as measured market size. [Census](https://data.census.gov/table/ACSSE2024.K202502?tid=ACSSE2024.K202502).

An illustrative business hypothesis is $3 per managed unit per month: 10,000 paid units yields $360,000 gross annual recurring revenue before churn and costs. Validate willingness to pay against existing property-management and deposit products. Sell saved reconciliation time, clearer evidence, and fewer settlement escalations. No customer traction or pricing validation is claimed.

Keep “from tenant toward ownership” as a long-term direction. Annual legally released interest, voluntary savings, and optional contributions from an operator could seed a separate account. A returned deposit may be needed for the next rental and must not automatically become an illiquid investment.

No property provider has been selected. RealT is excluded from the proposed critical path. Homebase's public documentation is inconsistent: one legal page describes accredited-only Reg D access, while its FAQ mentions limited non-accredited participation. Neither establishes an embedded retail product available to every US tenant. Lofty is an alternative to investigate, but uses Algorand and separate onboarding. Property rights, liquidity, fees, securities eligibility, tax reporting, and integration permission must be verified provider by provider. [Homebase legal page](https://docs.homebasedao.io/whitepaper/security-token-offerings/legal-compliance), [Homebase FAQ](https://docs.homebasedao.io/faq-and-guides/frequently-asked-questions), [Lofty](https://www.lofty.ai/how-it-works).

## What would make this a stronger entry

1. One polished deposit lifecycle with a genuine testnet transaction trail, accessible signing, and clear recipient/authority rules.
2. A claim where the tenant can inspect evidence before settlement, with a reasoned human decision for disputes.
3. A small property manager who confirms a specific workflow pain and agrees to evaluate the product. No fabricated pilot logos, interviews, or letters of intent.
4. A concrete jurisdiction and partner path, with unresolved approvals shown honestly.
5. A separate savings illustration and provider plan, without a fake property portfolio or promised APY.
6. A concise demo and explicit disclosure of pre-existing work. A new public repository is not a reset of project history.

**Proceed with the product experiment; do not launch real deposits yet.** Stop or pivot if operators do not value the workflow enough to pay, no viable custody route is approved, or blockchain adds cost without a clear user benefit.
