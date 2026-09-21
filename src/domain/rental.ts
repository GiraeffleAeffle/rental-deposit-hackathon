export type Role = 'tenant' | 'landlord' | 'arbitrator';
export type Stage = 'review' | 'disputed' | 'agreed' | 'awarded' | 'paid';

export type Activity = { title: string; detail: string; by: string };
export type Rental = {
  stage: Stage;
  principalCents: number;
  claimCents: number;
  awardCents: number | null;
  tenantResponse: string;
  reason: string;
  activity: Activity[];
};

export type Action =
  | { type: 'agree'; role: Role }
  | { type: 'dispute'; role: Role; reason: string }
  | { type: 'award'; role: Role; cents: number; reason: string }
  | { type: 'pay'; role: Role };

export const money = (cents: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(cents / 100);

export function initialRental(): Rental {
  return {
    stage: 'review',
    principalCents: 80000,
    claimCents: 12000,
    awardCents: null,
    tenantResponse:
      'There was already a mark beside the window when I moved in. It’s in our original inspection.',
    reason: '',
    activity: [
      {
        title: 'Repair claim submitted',
        detail: '$120 requested for a wall repair. Nothing has been paid.',
        by: 'Landlord · Sep 21',
      },
      {
        title: 'Move-out inspection added',
        detail: 'Both parties can review the condition record.',
        by: 'Landlord · Sep 20',
      },
      {
        title: 'Deposit fully funded',
        detail: 'Four installments of $200 recorded in this fictional example.',
        by: 'Demo ledger · Sep 2025',
      },
      {
        title: 'Move-in inspection agreed',
        detail: 'Initial condition recorded and shared.',
        by: 'Tenant + landlord · Sep 2025',
      },
    ],
  };
}

// This models a guided simulation, not authentication or payment authorization.
export function transition(state: Rental, action: Action): Rental {
  let next: Rental;
  let event: Activity;
  switch (action.type) {
    case 'agree':
      if (action.role !== 'tenant' || state.stage !== 'review')
        throw new Error('Only the tenant can accept a pending claim.');
      next = {
        ...state,
        stage: 'agreed',
        awardCents: state.claimCents,
        reason: 'Tenant accepted the landlord’s proposed deduction.',
      };
      event = {
        title: 'Settlement agreed',
        detail: 'Both sides agree to the proposed split. Payout is still pending.',
        by: 'Tenant · Just now',
      };
      break;
    case 'dispute':
      if (action.role !== 'tenant' || state.stage !== 'review')
        throw new Error('Only the tenant can dispute a pending claim.');
      if (action.reason.trim().length < 12)
        throw new Error('Add a short explanation of at least 12 characters.');
      next = { ...state, stage: 'disputed', tenantResponse: action.reason.trim() };
      event = {
        title: 'Human review requested',
        detail: action.reason.trim(),
        by: 'Tenant · Just now',
      };
      break;
    case 'award':
      if (action.role !== 'arbitrator' || state.stage !== 'disputed')
        throw new Error('A disputed case needs a decision by its assigned arbitrator.');
      if (
        !Number.isSafeInteger(action.cents) ||
        action.cents < 0 ||
        action.cents > state.claimCents
      )
        throw new Error('The allocation must be between zero and the claimed amount.');
      if (action.reason.trim().length < 12)
        throw new Error('Record a decision reason of at least 12 characters.');
      next = { ...state, stage: 'awarded', awardCents: action.cents, reason: action.reason.trim() };
      event = {
        title: 'Decision recorded',
        detail: `${money(action.cents)} allocated to the landlord. Payout is still pending.`,
        by: 'Arbitrator · Just now',
      };
      break;
    case 'pay':
      if (!['agreed', 'awarded'].includes(state.stage) || state.awardCents === null)
        throw new Error('A recorded agreement or decision is required before payout.');
      next = { ...state, stage: 'paid' };
      event = {
        title: 'Payout simulated',
        detail: `${money(state.principalCents - state.awardCents)} to the tenant; ${money(state.awardCents)} to the landlord. No real funds moved.`,
        by: 'Demo ledger · Just now',
      };
      break;
  }
  return { ...next, activity: [event, ...state.activity] };
}

export function balances(state: Rental) {
  const allocated = state.awardCents ?? 0;
  return {
    held: state.stage === 'paid' ? 0 : state.principalCents,
    landlord: state.awardCents,
    tenant: state.awardCents === null ? null : state.principalCents - allocated,
    paid: state.stage === 'paid' ? state.principalCents : 0,
    // A separate fictional active tenancy holds $1,200. An unfunded $800 request is excluded.
    portfolioHeld: 120000 + (state.stage === 'paid' ? 0 : state.principalCents),
    fundingOutstanding: 80000,
  };
}

export function parseCents(value: string): number | null {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export function savingsProjection(
  monthlyCents: number,
  annualReleasedInterestCents: number,
  annualRatePercent: number,
  years: number,
) {
  if (
    ![monthlyCents, annualReleasedInterestCents, years].every(Number.isSafeInteger) ||
    monthlyCents < 0 ||
    annualReleasedInterestCents < 0 ||
    years < 1 ||
    years > 30 ||
    !Number.isFinite(annualRatePercent) ||
    annualRatePercent < 0 ||
    annualRatePercent > 20
  )
    throw new Error('Invalid projection assumptions.');
  const contribution = monthlyCents * 12 + annualReleasedInterestCents;
  let amount = 0;
  return Array.from({ length: years }, (_, i) => {
    // Contributions enter at year-end. This deliberately does not overstate intra-year compounding.
    amount = amount * (1 + annualRatePercent / 100) + contribution;
    return {
      year: i + 1,
      balanceCents: Math.round(amount),
      contributionCents: contribution * (i + 1),
    };
  });
}
