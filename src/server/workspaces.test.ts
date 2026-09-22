import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStore } from './store.ts';
import { actorFor, loadWorkspace, openDemo, runCommand } from './workspaces.ts';
import type { WorkspaceState } from '../domain/workflow.ts';

test('demo sessions and role changes cannot authorize another workspace or connected funds', async () => {
  const store = new LocalStore(':memory:');
  const state = await openDemo(store, 'one-session', 'solana');
  await assert.rejects(
    () =>
      loadWorkspace(store, state.id, { kind: 'demo', session: 'other-session', role: 'tenant' }),
    /another session/,
  );
  assert.throws(
    () =>
      actorFor(
        { ...state, mode: 'connected' },
        { kind: 'demo', session: 'one-session', role: 'tenant' },
      ),
    /another session/,
  );
  await assert.rejects(
    () =>
      runCommand(
        store,
        state.id,
        { kind: 'demo', session: 'one-session', role: 'arbitrator' },
        { type: 'accept' },
        'command-111',
        0,
      ),
    /not awaiting/,
  );
  await store.close();
});

test('records survive process-store restart, duplicates return once, stale revisions are rejected', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rental-store-test-'));
  const filename = join(dir, 'records.sqlite');
  let store = new LocalStore(filename);
  try {
    const state = await openDemo(store, 'session-restart', 'robinhood');
    const access = { kind: 'demo', session: 'session-restart', role: 'tenant' } as const;
    const accepted = await runCommand(
      store,
      state.id,
      access,
      { type: 'accept' },
      'accept-command-1',
      0,
    );
    await store.close();
    store = new LocalStore(filename);
    assert.deepEqual(await loadWorkspace(store, state.id, access), accepted);
    assert.deepEqual(
      await runCommand(store, state.id, access, { type: 'accept' }, 'accept-command-1', 0),
      accepted,
    );
    await assert.rejects(
      () =>
        runCommand(
          store,
          state.id,
          access,
          { type: 'document', name: 'Record', body: 'Some meaningful condition evidence.' },
          'new-command-123',
          0,
        ),
      /workspace changed/,
    );
    assert.equal((await store.get<WorkspaceState>(`workspace:${state.id}`))?.revision, 1);
  } finally {
    await store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
