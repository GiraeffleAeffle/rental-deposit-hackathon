import { randomUUID } from 'node:crypto';
import { isNetwork, type Network, type Role } from '../domain/assets.ts';
import {
  applyCommand,
  createWorkspace,
  reconcileFixture,
  requireActor,
  roleForSubject,
  WorkflowError,
  type Actor,
  type Command,
  type WorkspaceState,
} from '../domain/workflow.ts';
import type { Store } from './store.ts';

export class AccessError extends Error {}
export class ConflictError extends Error {}
export type Access =
  { kind: 'demo'; session: string; role: Role } | { kind: 'verified'; subject: string };

export function actorFor(state: WorkspaceState, access: Access): Actor {
  if (access.kind === 'demo') {
    if (state.mode !== 'demo' || state.owner !== access.session)
      throw new AccessError('This demonstration belongs to another session.');
    const actor = { role: access.role, subject: `${access.session}:${access.role}` };
    requireActor(state, actor);
    return actor;
  }
  if (state.mode !== 'connected')
    throw new AccessError('Use the demonstration session for fictional workspaces.');
  const role = roleForSubject(state, access.subject);
  if (!role) throw new AccessError('This identity is not a party to this tenancy.');
  return { role, subject: access.subject };
}

export async function loadWorkspace(store: Store, id: string, access: Access) {
  const state = await store.get<WorkspaceState>(`workspace:${id}`);
  if (!state) throw new AccessError('Workspace not found.');
  actorFor(state, access);
  return state;
}

export async function openDemo(store: Store, session: string, network: Network, restart = false) {
  const key = `demo:${session}:${network}`;
  const prior = await store.get<{ workspaceId: string }>(key);
  if (prior && !restart) {
    const state = await store.get<WorkspaceState>(`workspace:${prior.workspaceId}`);
    if (state) return state;
  }
  const state = createWorkspace(randomUUID(), session, network, Date.now());
  await store.create(`workspace:${state.id}`, state);
  if (prior) await store.update(key, () => ({ workspaceId: state.id }));
  else await store.create(key, { workspaceId: state.id });
  return state;
}

export function decodeCommand(value: unknown): Command {
  if (!value || typeof value !== 'object' || !('type' in value))
    throw new WorkflowError('A command is required.');
  const item = value as Record<string, unknown>;
  const text = (field: string, max = 12000) => {
    if (typeof item[field] !== 'string' || item[field].length > max)
      throw new WorkflowError(`Invalid ${field}.`);
    return item[field] as string;
  };
  switch (item.type) {
    case 'accept':
    case 'accept_claim':
    case 'fixture_distribution':
      return { type: item.type };
    case 'plan': {
      if (
        !['fund', 'supply', 'release', 'contribute', 'buy', 'sell', 'withdraw', 'settle'].includes(
          String(item.kind),
        )
      )
        throw new WorkflowError('Unsupported financial operation.');
      return {
        type: 'plan',
        kind: item.kind as 'fund',
        ...(item.amount === undefined ? {} : { amount: text('amount', 38) }),
      };
    }
    case 'authorize':
    case 'cancel':
      return { type: item.type, operationId: text('operationId', 160) };
    case 'fixture_return':
      return { type: item.type, amount: text('amount', 38) };
    case 'fixture_liquidity':
      if (typeof item.available !== 'boolean') throw new WorkflowError('Invalid liquidity flag.');
      return { type: item.type, available: item.available };
    case 'claim':
    case 'award':
      return { type: item.type, amount: text('amount', 38), reason: text('reason', 3000) };
    case 'dispute':
      return { type: item.type, reason: text('reason', 3000) };
    case 'document':
      return { type: item.type, name: text('name', 120), body: text('body') };
    default:
      throw new WorkflowError('Unknown command.');
  }
}

export async function runCommand(
  store: Store,
  id: string,
  access: Access,
  input: unknown,
  commandId: string,
  revision: number,
  now = Date.now(),
) {
  const command = decodeCommand(input);
  return store.update<WorkspaceState>(`workspace:${id}`, (state) => {
    const actor = actorFor(state, access);
    if (state.appliedCommands.includes(commandId)) return state;
    if (state.revision !== revision)
      throw new ConflictError('The workspace changed. Refresh it and review the action again.');
    if (state.appliedCommands.length >= 1000)
      throw new WorkflowError('Restart this demonstration to begin a fresh scenario.');
    // Native financial execution is available only through a verified chain plan and receipt.
    // This endpoint implements the persistent demonstration and cannot book connected money.
    if (state.mode !== 'demo')
      throw new WorkflowError(
        'Connected operations require a configured and verified escrow deployment.',
        'integration_unavailable',
      );
    return applyCommand(state, actor, command, commandId, now);
  });
}

export async function reconcileDemo(
  store: Store,
  id: string,
  access: Access,
  operationId?: string,
  fail = false,
  now = Date.now(),
) {
  return store.update<WorkspaceState>(`workspace:${id}`, (state) => {
    actorFor(state, access);
    if (state.mode !== 'demo')
      throw new AccessError('A demonstration receipt cannot settle connected funds.');
    let next = state;
    for (const operation of state.operations.filter(
      (item) => item.state === 'submitted' && (!operationId || item.id === operationId),
    )) {
      next = reconcileFixture(next, operation.id, now, fail);
    }
    return next;
  });
}

export function decodeNetwork(value: unknown): Network {
  if (!isNetwork(value)) throw new WorkflowError('Choose a supported network.');
  return value;
}
