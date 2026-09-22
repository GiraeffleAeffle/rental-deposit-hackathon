import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalStore } from './store.ts';
import { openDemo, runCommand } from './workspaces.ts';
import { reconcileDemonstrations } from './jobs.ts';
import { createWorkspace } from '../domain/workflow.ts';
test('durable worker resumes a confirmed fixture exactly once and skips connected workspaces', async () => {
  const store = new LocalStore(':memory:');
  let state = await openDemo(store, 'browser', 'solana', false);
  for (const role of ['tenant', 'landlord'] as const)
    state = await runCommand(
      store,
      state.id,
      { kind: 'demo', session: 'browser', role },
      { type: 'accept' },
      `agree-${role}`,
      state.revision,
    );
  state = await runCommand(
    store,
    state.id,
    { kind: 'demo', session: 'browser', role: 'tenant' },
    { type: 'plan', kind: 'fund' },
    'fund-plan',
    state.revision,
  );
  state = await runCommand(
    store,
    state.id,
    { kind: 'demo', session: 'browser', role: 'tenant' },
    { type: 'authorize', operationId: state.operations[0].id },
    'fund-authorize',
    state.revision,
  );
  const real = {
    ...createWorkspace('real', 'user', 'solana', Date.now()),
    mode: 'connected' as const,
    operations: state.operations,
  };
  await store.create('workspace:real', real);
  assert.equal((await reconcileDemonstrations(store)).reconciled, 1);
  assert.equal((await reconcileDemonstrations(store)).reconciled, 0);
  assert.deepEqual(await store.get('workspace:real'), real);
  await store.close();
});
