import {
  atomic,
  minimum,
  networks,
  positiveDifference,
  type Network,
  type Role,
} from './assets.ts';

export type OperationKind =
  'fund' | 'supply' | 'release' | 'contribute' | 'buy' | 'sell' | 'withdraw' | 'settle';
export type OperationState =
  'awaiting_authorization' | 'submitted' | 'completed' | 'failed' | 'cancelled';
export type Actor = { subject: string; role: Role };
export type Proof = {
  kind: 'fixture' | 'chain';
  reference: string;
  network: Network;
  observedAt: string;
  detail: string;
};
export type FinancialOperation = {
  id: string;
  kind: OperationKind;
  state: OperationState;
  subject: string;
  role: Role;
  amount: string;
  output: string;
  recipient: string;
  expiresAt: number;
  createdAt: string;
  authorizedAt?: string;
  completedAt?: string;
  error?: string;
  proof?: Proof;
};
export type Activity = {
  id: string;
  at: string;
  title: string;
  detail: string;
  by: Role | 'system';
};
export type DocumentRecord = {
  id: string;
  name: string;
  body: string;
  author: string;
  createdAt: string;
};
export type WorkspaceState = {
  id: string;
  owner: string;
  mode: 'demo' | 'connected';
  network: Network;
  revision: number;
  property: string;
  createdAt: string;
  parties: Record<Role, string>;
  accepted: { tenant: boolean; landlord: boolean };
  stage: 'draft' | 'accepted' | 'active' | 'closing' | 'closed';
  security: {
    required: string;
    principal: string;
    assets: string;
    supplied: boolean;
    earned: string;
    released: string;
    liquid: string;
    policyAllowsRelease: boolean;
    valuationFresh: boolean;
  };
  personal: {
    cash: string;
    units: string;
    multiplier: string;
    contributed: string;
    withdrawn: string;
    spent: string;
  };
  claim: {
    state: 'none' | 'proposed' | 'disputed' | 'accepted' | 'awarded' | 'paid';
    amount: string;
    allocation: string | null;
    reason: string;
    response: string;
    decision: string;
  };
  settlement: { tenant: string; landlord: string } | null;
  operations: FinancialOperation[];
  activity: Activity[];
  documents: DocumentRecord[];
  appliedCommands: string[];
};

export type Command =
  | { type: 'accept' }
  | { type: 'plan'; kind: OperationKind; amount?: string }
  | { type: 'authorize'; operationId: string }
  | { type: 'cancel'; operationId: string }
  | { type: 'fixture_return'; amount: string }
  | { type: 'fixture_distribution' }
  | { type: 'fixture_liquidity'; available: boolean }
  | { type: 'claim'; amount: string; reason: string }
  | { type: 'accept_claim' }
  | { type: 'dispute'; reason: string }
  | { type: 'award'; amount: string; reason: string }
  | { type: 'document'; name: string; body: string };

export class WorkflowError extends Error {
  code: string;
  constructor(message: string, code = 'invalid_action') {
    super(message);
    this.name = 'WorkflowError';
    this.code = code;
  }
}

function requireCondition(value: unknown, message: string): asserts value {
  if (!value) throw new WorkflowError(message);
}

export function createWorkspace(
  id: string,
  owner: string,
  network: Network,
  now: number,
  mode: WorkspaceState['mode'] = 'demo',
): WorkspaceState {
  const timestamp = new Date(now).toISOString();
  return {
    id,
    owner,
    mode,
    network,
    revision: 0,
    property: 'Cedar Court · Apartment 04',
    createdAt: timestamp,
    parties: {
      tenant: mode === 'demo' ? `${owner}:tenant` : owner,
      landlord: `${owner}:landlord`,
      arbitrator: `${owner}:arbitrator`,
    },
    accepted: { tenant: false, landlord: false },
    stage: 'draft',
    security: {
      required: '3000000000',
      principal: '0',
      assets: '0',
      supplied: false,
      earned: '0',
      released: '0',
      liquid: '0',
      policyAllowsRelease: true,
      valuationFresh: true,
    },
    personal: {
      cash: '0',
      units: '0',
      multiplier: '1000000000000000000',
      contributed: '0',
      withdrawn: '0',
      spent: '0',
    },
    claim: { state: 'none', amount: '0', allocation: null, reason: '', response: '', decision: '' },
    settlement: null,
    operations: [],
    activity: [
      {
        id: `${id}:created`,
        at: timestamp,
        title: 'Tenancy prepared',
        detail:
          'The example agreement requires 3,000 units of security and permits eligible earnings to be released.',
        by: 'system',
      },
    ],
    documents: [
      {
        id: `${id}:agreement`,
        name: 'Example tenancy agreement',
        body: 'Cedar Court, Apartment 04. Required security: 3,000 units. This fictional test agreement permits earnings release only while required security remains funded and redemption is available. Investments belong to the tenant separately. This is a demo policy, not a legal agreement.',
        author: 'system',
        createdAt: timestamp,
      },
    ],
    appliedCommands: [],
  };
}

export function roleForSubject(state: WorkspaceState, subject: string): Role | null {
  return (
    (Object.keys(state.parties) as Role[]).find((role) => state.parties[role] === subject) ?? null
  );
}

export function requireActor(state: WorkspaceState, actor: Actor, role?: Role) {
  requireCondition(
    state.parties[actor.role] === actor.subject,
    'This identity is not assigned to this tenancy.',
  );
  if (role) requireCondition(actor.role === role, `Only the assigned ${role} can do this.`);
}

function pending(state: WorkspaceState) {
  return state.operations.some((operation) => operation.state === 'submitted');
}

export function personalValue(state: WorkspaceState): string {
  const unitScale = 10n ** BigInt(networks[state.network].investmentDecimals);
  return (
    (atomic(state.personal.units) * atomic(state.personal.multiplier) * 500000000n) /
    (unitScale * 1000000000000000000n)
  ).toString();
}

export function releasable(state: WorkspaceState): string {
  if (
    state.stage !== 'active' ||
    !state.security.policyAllowsRelease ||
    !state.security.valuationFresh ||
    state.claim.state !== 'none' ||
    pending(state)
  )
    return '0';
  return minimum(
    positiveDifference(atomic(state.security.assets), atomic(state.security.required)),
    positiveDifference(atomic(state.security.earned), atomic(state.security.released)),
    atomic(state.security.liquid),
  ).toString();
}

export function summary(state: WorkspaceState) {
  const holding = personalValue(state);
  return {
    releasable: releasable(state),
    retainedEarnings: positiveDifference(
      atomic(state.security.earned),
      atomic(state.security.released),
    ).toString(),
    investmentValue: holding,
    portfolioValue: (atomic(holding) + atomic(state.personal.cash)).toString(),
    shortfall:
      state.stage === 'closed' || state.security.principal === '0'
        ? '0'
        : positiveDifference(
            atomic(state.security.required),
            atomic(state.security.assets),
          ).toString(),
    pending: pending(state),
  };
}

function addActivity(
  state: WorkspaceState,
  id: string,
  now: number,
  actor: Role | 'system',
  title: string,
  detail: string,
) {
  state.activity.unshift({ id, at: new Date(now).toISOString(), title, detail, by: actor });
}

function requireReason(value: string) {
  requireCondition(
    typeof value === 'string' && value.trim().length >= 12 && value.trim().length <= 3000,
    'Add a clear explanation between 12 and 3,000 characters.',
  );
}

function planOperation(
  state: WorkspaceState,
  kind: OperationKind,
  amount: string | undefined,
  actor: Actor,
  now: number,
  id: string,
): FinancialOperation {
  requireCondition(!pending(state), 'Reconcile the submitted operation before preparing another.');
  let input = amount ?? '0';
  let output = '0';
  let recipient = state.parties.tenant;
  if (kind === 'fund') {
    requireActor(state, actor, 'tenant');
    requireCondition(
      state.stage === 'accepted' && state.security.principal === '0',
      'Both parties must accept the agreement before funding.',
    );
    input = state.security.required;
    recipient = `escrow:${state.id}`;
  } else if (kind === 'supply') {
    requireActor(state, actor, 'tenant');
    requireCondition(
      state.stage === 'active' && !state.security.supplied && atomic(state.security.assets) > 0n,
      'A funded deposit is needed before supplying it.',
    );
    input = state.security.assets;
    recipient = `lending:${state.network}`;
  } else if (kind === 'release') {
    requireActor(state, actor, 'tenant');
    requireCondition(
      atomic(input) > 0n && atomic(input) <= atomic(releasable(state)),
      'This amount is not currently eligible for release.',
    );
  } else if (kind === 'contribute') {
    requireActor(state, actor, 'tenant');
    requireCondition(
      atomic(input) > 0n && atomic(input) <= 10000000000n,
      'Choose personal savings between zero and 10,000 units.',
    );
    output = input;
  } else if (kind === 'buy') {
    requireActor(state, actor, 'tenant');
    requireCondition(
      atomic(input) > 0n && atomic(input) <= atomic(state.personal.cash),
      'Only settled personal cash can fund an investment.',
    );
    output = (
      (atomic(input) *
        10n ** BigInt(networks[state.network].investmentDecimals) *
        1000000000000000000n) /
      (500000000n * atomic(state.personal.multiplier))
    ).toString();
    requireCondition(atomic(output) > 0n, 'The order is below the asset precision.');
  } else if (kind === 'sell') {
    requireActor(state, actor, 'tenant');
    input = amount ?? state.personal.units;
    requireCondition(
      atomic(input) > 0n && atomic(input) <= atomic(state.personal.units),
      'Choose an amount within your settled holding.',
    );
    output = (
      (atomic(input) * atomic(state.personal.multiplier) * 500000000n) /
      (10n ** BigInt(networks[state.network].investmentDecimals) * 1000000000000000000n)
    ).toString();
  } else if (kind === 'withdraw') {
    requireActor(state, actor, 'tenant');
    requireCondition(
      atomic(input) > 0n && atomic(input) <= atomic(state.personal.cash),
      'Only settled, uncommitted personal cash can be withdrawn.',
    );
  } else if (kind === 'settle') {
    requireCondition(
      actor.role === 'tenant' ||
        actor.role === 'landlord' ||
        (actor.role === 'arbitrator' && state.claim.state === 'awarded'),
      'This identity cannot execute that allocation.',
    );
    requireCondition(
      ['accepted', 'awarded'].includes(state.claim.state) &&
        state.claim.allocation !== null &&
        state.stage === 'closing',
      'An agreement or assigned arbitration decision is required.',
    );
    requireCondition(
      atomic(state.security.liquid) >= atomic(state.security.assets),
      'Deposit redemption is currently unavailable. Settlement remains pending.',
    );
    requireCondition(
      atomic(state.claim.allocation) <= atomic(state.security.assets),
      'The allocation exceeds available deposit assets.',
    );
    input = state.security.assets;
    output = state.claim.allocation;
    recipient = 'recorded-settlement-parties';
  } else throw new WorkflowError('Unknown financial operation.');
  return {
    id,
    kind,
    state: 'awaiting_authorization',
    subject: actor.subject,
    role: actor.role,
    amount: input,
    output,
    recipient,
    expiresAt: now + 120000,
    createdAt: new Date(now).toISOString(),
  };
}

export function applyCommand(
  current: WorkspaceState,
  actor: Actor,
  command: Command,
  id: string,
  now: number,
): WorkspaceState {
  requireActor(current, actor);
  requireCondition(/^[a-zA-Z0-9:_-]{8,160}$/.test(id), 'An idempotency identifier is required.');
  if (current.appliedCommands.includes(id)) return current;
  const state = structuredClone(current);
  if (command.type === 'accept') {
    requireCondition(
      actor.role !== 'arbitrator' && state.stage === 'draft',
      'The agreement is not awaiting this acceptance.',
    );
    state.accepted[actor.role as 'tenant' | 'landlord'] = true;
    if (state.accepted.tenant && state.accepted.landlord) state.stage = 'accepted';
    addActivity(
      state,
      id,
      now,
      actor.role,
      'Agreement accepted',
      `The ${actor.role} accepted the recorded security and earnings release policy.`,
    );
  } else if (command.type === 'plan') {
    const operation = planOperation(state, command.kind, command.amount, actor, now, id);
    state.operations.unshift(operation);
    addActivity(
      state,
      id,
      now,
      actor.role,
      'Operation prepared',
      `${command.kind} is awaiting explicit confirmation. No money has moved.`,
    );
  } else if (command.type === 'authorize') {
    const operation = state.operations.find((item) => item.id === command.operationId);
    requireCondition(
      operation &&
        operation.subject === actor.subject &&
        operation.state === 'awaiting_authorization',
      'This operation is not awaiting your authorization.',
    );
    requireCondition(now < operation.expiresAt, 'This quote has expired. Prepare a new operation.');
    const fresh = planOperation(state, operation.kind, operation.amount, actor, now, operation.id);
    requireCondition(
      fresh.output === operation.output &&
        fresh.recipient === operation.recipient &&
        fresh.amount === operation.amount,
      'The operation changed. Review a fresh plan.',
    );
    operation.state = 'submitted';
    operation.authorizedAt = new Date(now).toISOString();
    addActivity(
      state,
      id,
      now,
      actor.role,
      'Confirmation recorded',
      'The operation is submitted for reconciliation. Its result is not booked yet.',
    );
  } else if (command.type === 'cancel') {
    const operation = state.operations.find((item) => item.id === command.operationId);
    requireCondition(
      operation &&
        operation.subject === actor.subject &&
        operation.state === 'awaiting_authorization',
      'Only an unsigned operation can be cancelled.',
    );
    operation.state = 'cancelled';
  } else if (command.type.startsWith('fixture_')) {
    requireCondition(
      state.mode === 'demo',
      'Controlled example events are only available in the demonstration.',
    );
    requireCondition(
      !pending(state),
      'Reconcile the pending operation before changing the fixture.',
    );
    if (command.type === 'fixture_return') {
      requireCondition(
        state.stage === 'active' && state.security.supplied,
        'Supply the funded deposit before adding example earnings.',
      );
      requireCondition(
        atomic(command.amount) > 0n && atomic(command.amount) <= 100000000n,
        'The example return must be between zero and 100 units.',
      );
      state.security.assets = (atomic(state.security.assets) + atomic(command.amount)).toString();
      state.security.earned = (atomic(state.security.earned) + atomic(command.amount)).toString();
      state.security.liquid = state.security.assets;
      addActivity(
        state,
        id,
        now,
        'system',
        'Example earnings added',
        'A controlled test event changed the lending value. This is not live interest or a forecast.',
      );
    } else if (command.type === 'fixture_distribution') {
      requireCondition(
        atomic(state.personal.units) > 0n,
        'Buy a sample holding before showing an accumulating return.',
      );
      state.personal.multiplier = ((atomic(state.personal.multiplier) * 105n) / 100n).toString();
      addActivity(
        state,
        id,
        now,
        'system',
        'Example accumulating return',
        'Represented exposure increased by 5% in this fixture. Raw units and cash did not change.',
      );
    } else if (command.type === 'fixture_liquidity') {
      state.security.liquid = command.available ? state.security.assets : '0';
      addActivity(
        state,
        id,
        now,
        'system',
        command.available ? 'Example liquidity restored' : 'Example redemption paused',
        'The controlled fixture changed redeemable liquidity.',
      );
    }
  } else if (command.type === 'claim') {
    requireActor(state, actor, 'landlord');
    requireReason(command.reason);
    requireCondition(
      state.stage === 'active' && state.claim.state === 'none' && !pending(state),
      'Finish pending operations before proposing settlement.',
    );
    requireCondition(
      atomic(command.amount) <= atomic(state.security.assets) &&
        atomic(command.amount) <= atomic(state.security.required),
      'The claim cannot exceed remaining security.',
    );
    state.claim = {
      state: 'proposed',
      amount: command.amount,
      allocation: null,
      reason: command.reason.trim(),
      response: '',
      decision: '',
    };
    state.stage = 'closing';
    addActivity(
      state,
      id,
      now,
      actor.role,
      'Settlement proposed',
      'The requested deduction needs the tenant’s agreement or assigned human review.',
    );
  } else if (command.type === 'accept_claim') {
    requireActor(state, actor, 'tenant');
    requireCondition(state.claim.state === 'proposed', 'There is no pending claim to accept.');
    state.claim.state = 'accepted';
    state.claim.allocation = state.claim.amount;
    addActivity(
      state,
      id,
      now,
      actor.role,
      'Settlement agreed',
      'The allocation is agreed. Payments remain pending.',
    );
  } else if (command.type === 'dispute') {
    requireActor(state, actor, 'tenant');
    requireReason(command.reason);
    requireCondition(state.claim.state === 'proposed', 'There is no pending claim to dispute.');
    state.claim.state = 'disputed';
    state.claim.response = command.reason.trim();
    addActivity(state, id, now, actor.role, 'Human review requested', command.reason.trim());
  } else if (command.type === 'award') {
    requireActor(state, actor, 'arbitrator');
    requireReason(command.reason);
    requireCondition(
      state.claim.state === 'disputed',
      'Only an assigned disputed claim can be decided.',
    );
    requireCondition(
      atomic(command.amount) <= atomic(state.claim.amount) &&
        atomic(command.amount) <= atomic(state.security.assets),
      'The award cannot exceed the claim or available security.',
    );
    state.claim.state = 'awarded';
    state.claim.allocation = command.amount;
    state.claim.decision = command.reason.trim();
    addActivity(state, id, now, actor.role, 'Decision recorded', command.reason.trim());
  } else if (command.type === 'document') {
    requireCondition(
      command.name.trim().length >= 3 &&
        command.name.length <= 120 &&
        command.body.trim().length >= 12 &&
        command.body.length <= 12000,
      'Add a title and a record between 12 and 12,000 characters.',
    );
    state.documents.push({
      id,
      name: command.name.trim(),
      body: command.body.trim(),
      author: actor.subject,
      createdAt: new Date(now).toISOString(),
    });
    addActivity(state, id, now, actor.role, 'Shared record added', command.name.trim());
  } else throw new WorkflowError('Unknown command.');
  state.appliedCommands.push(id);
  state.revision += 1;
  return state;
}

/** Called by a trusted reconciler, never with a client-supplied receipt. */
export function reconcileFixture(
  current: WorkspaceState,
  operationId: string,
  now: number,
  fail = false,
): WorkspaceState {
  requireCondition(current.mode === 'demo', 'A fixture cannot settle a connected operation.');
  const currentOperation = current.operations.find((operation) => operation.id === operationId);
  requireCondition(currentOperation, 'Operation not found.');
  if (currentOperation.state === 'completed' || currentOperation.state === 'failed') return current;
  requireCondition(
    currentOperation.state === 'submitted',
    'Only submitted operations can be reconciled.',
  );
  const state = structuredClone(current);
  const operation = state.operations.find((item) => item.id === operationId)!;
  if (fail) {
    operation.state = 'failed';
    operation.error = 'The controlled test route failed before moving funds.';
    addActivity(
      state,
      `${operationId}:failed`,
      now,
      'system',
      'Example operation failed',
      'Existing cash is preserved. Prepare a new order to retry.',
    );
  } else {
    const input = atomic(operation.amount);
    switch (operation.kind) {
      case 'fund':
        state.security.principal = operation.amount;
        state.security.assets = operation.amount;
        state.security.liquid = operation.amount;
        state.stage = 'active';
        break;
      case 'supply':
        state.security.supplied = true;
        break;
      case 'release':
        state.security.assets = (atomic(state.security.assets) - input).toString();
        state.security.liquid = (atomic(state.security.liquid) - input).toString();
        state.security.released = (atomic(state.security.released) + input).toString();
        state.personal.cash = (atomic(state.personal.cash) + input).toString();
        break;
      case 'contribute':
        state.personal.cash = (atomic(state.personal.cash) + input).toString();
        state.personal.contributed = (atomic(state.personal.contributed) + input).toString();
        break;
      case 'buy':
        state.personal.cash = (atomic(state.personal.cash) - input).toString();
        state.personal.units = (atomic(state.personal.units) + atomic(operation.output)).toString();
        state.personal.spent = (atomic(state.personal.spent) + input).toString();
        break;
      case 'sell':
        state.personal.units = (atomic(state.personal.units) - input).toString();
        state.personal.cash = (atomic(state.personal.cash) + atomic(operation.output)).toString();
        break;
      case 'withdraw':
        state.personal.cash = (atomic(state.personal.cash) - input).toString();
        state.personal.withdrawn = (atomic(state.personal.withdrawn) + input).toString();
        break;
      case 'settle':
        state.settlement = {
          landlord: operation.output,
          tenant: (input - atomic(operation.output)).toString(),
        };
        state.security.assets = '0';
        state.security.liquid = '0';
        state.security.supplied = false;
        state.claim.state = 'paid';
        state.stage = 'closed';
        break;
    }
    operation.state = 'completed';
    operation.completedAt = new Date(now).toISOString();
    operation.proof = {
      kind: 'fixture',
      reference: `fixture:${operationId}`,
      network: state.network,
      observedAt: operation.completedAt,
      detail: 'Controlled accounting fixture; no blockchain transaction or issuer trade.',
    };
    addActivity(
      state,
      `${operationId}:completed`,
      now,
      'system',
      `${operation.kind[0].toUpperCase()}${operation.kind.slice(1)} reconciled`,
      'The demonstration ledger records the completed effect once. No real money moved.',
    );
  }
  state.revision += 1;
  return state;
}
