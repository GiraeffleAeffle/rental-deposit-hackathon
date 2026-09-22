import test from 'node:test';
import assert from 'node:assert/strict';
import { displayAmount, parseAmount, type Network, type Role } from './assets.ts';
import {
  applyCommand,
  createWorkspace,
  reconcileFixture,
  summary,
  type Command,
  type WorkspaceState,
} from './workflow.ts';

function scenario(network: Network) {
  let state = createWorkspace('tenancy-123', 'session-123', network, 1000000);
  let sequence = 0;
  const run = (role: Role, command: Command) => {
    state = applyCommand(
      state,
      { role, subject: `session-123:${role}` },
      command,
      `command-${++sequence}`,
      1000000,
    );
    return state;
  };
  const execute = (
    role: Role,
    kind: 'fund' | 'supply' | 'release' | 'contribute' | 'buy' | 'sell' | 'withdraw' | 'settle',
    amount?: string,
    fail = false,
  ) => {
    run(role, { type: 'plan', kind, amount });
    const id = state.operations[0].id;
    run(role, { type: 'authorize', operationId: id });
    state = reconcileFixture(state, id, 1000001, fail);
    return state;
  };
  return {
    get state() {
      return state;
    },
    set state(next: WorkspaceState) {
      state = next;
    },
    run,
    execute,
  };
}

for (const network of ['robinhood', 'solana'] as const) {
  test(`${network}: full lifecycle conserves security and leaves investments independent after settlement`, () => {
    const s = scenario(network);
    s.run('landlord', { type: 'accept' });
    s.run('tenant', { type: 'accept' });
    s.execute('tenant', 'fund');
    s.execute('tenant', 'supply');
    s.run('tenant', { type: 'fixture_return', amount: '10000000' });
    assert.equal(summary(s.state).releasable, '10000000');
    s.execute('tenant', 'release', '10000000');
    assert.equal(s.state.security.assets, '3000000000');
    assert.equal(s.state.personal.cash, '10000000');
    s.execute('tenant', 'buy', '10000000');
    const units = s.state.personal.units;
    s.run('tenant', { type: 'fixture_distribution' });
    assert.equal(s.state.personal.units, units);
    assert.equal(s.state.personal.cash, '0');
    assert.equal(summary(s.state).investmentValue, '10500000');
    s.run('landlord', {
      type: 'claim',
      amount: '120000000',
      reason: 'The wall repair is described in the attached condition record.',
    });
    s.run('tenant', { type: 'accept_claim' });
    assert.equal(s.state.settlement, null);
    s.execute('landlord', 'settle');
    assert.deepEqual(s.state.settlement, { landlord: '120000000', tenant: '2880000000' });
    assert.equal(s.state.personal.units, units);
    assert.equal(s.state.stage, 'closed');
    s.execute('tenant', 'sell');
    s.execute('tenant', 'withdraw', '10500000');
    assert.equal(s.state.personal.cash, '0');
    assert.equal(s.state.personal.units, '0');
    assert.equal(s.state.personal.withdrawn, '10500000');
  });
}

test('identity, both acceptances and remaining security constrain funding and release', () => {
  const s = scenario('solana');
  assert.throws(() => s.execute('tenant', 'fund'), /Both parties/);
  assert.throws(
    () =>
      applyCommand(
        s.state,
        { role: 'tenant', subject: 'other-user' },
        { type: 'accept' },
        'command-evil',
        1000,
      ),
    /not assigned/,
  );
  s.run('tenant', { type: 'accept' });
  assert.throws(() => s.execute('tenant', 'fund'), /Both parties/);
  s.run('landlord', { type: 'accept' });
  s.execute('tenant', 'fund');
  s.execute('tenant', 'supply');
  assert.throws(() => s.execute('landlord', 'release', '1'), /Only the assigned tenant/);
  assert.throws(() => s.execute('tenant', 'buy', '1000000'), /personal cash/);
  s.run('tenant', { type: 'fixture_return', amount: '10000000' });
  s.run('tenant', { type: 'fixture_liquidity', available: false });
  assert.equal(summary(s.state).releasable, '0');
  assert.throws(() => s.execute('tenant', 'release', '1'), /not currently eligible/);
  s.run('tenant', { type: 'fixture_liquidity', available: true });
  assert.throws(() => s.execute('tenant', 'release', '10000001'), /not currently eligible/);
  const restricted = structuredClone(s.state);
  restricted.security.policyAllowsRelease = false;
  assert.equal(summary(restricted).releasable, '0');
  restricted.security.policyAllowsRelease = true;
  restricted.security.assets = '2900000000';
  assert.equal(summary(restricted).shortfall, '100000000');
  assert.equal(summary(restricted).releasable, '0');
});

test('failed purchase and replay never release earnings twice', () => {
  const s = scenario('robinhood');
  s.run('tenant', { type: 'accept' });
  s.run('landlord', { type: 'accept' });
  s.execute('tenant', 'fund');
  s.execute('tenant', 'supply');
  s.run('tenant', { type: 'fixture_return', amount: '10000000' });
  s.execute('tenant', 'release', '10000000');
  const completed = s.state.operations[0];
  assert.deepEqual(reconcileFixture(s.state, completed.id, 2000000), s.state);
  s.execute('tenant', 'buy', '10000000', true);
  assert.equal(s.state.personal.cash, '10000000');
  assert.equal(s.state.security.released, '10000000');
  s.execute('tenant', 'buy', '10000000');
  assert.equal(s.state.security.released, '10000000');
  assert.equal(s.state.security.assets, '3000000000');
});

test('a contested claim requires its assigned arbitrator and a capped decision', () => {
  const s = scenario('solana');
  s.run('tenant', { type: 'accept' });
  s.run('landlord', { type: 'accept' });
  s.execute('tenant', 'fund');
  s.run('landlord', {
    type: 'claim',
    amount: '120000000',
    reason: 'The claim concerns damage recorded after move-out.',
  });
  s.run('tenant', {
    type: 'dispute',
    reason: 'The original inspection already records the same damage.',
  });
  assert.throws(() => s.execute('landlord', 'settle'), /agreement or assigned/);
  assert.throws(
    () =>
      s.run('landlord', {
        type: 'award',
        amount: '120000000',
        reason: 'The record does not support charging the full repair.',
      }),
    /assigned arbitrator/,
  );
  assert.throws(
    () =>
      s.run('arbitrator', {
        type: 'award',
        amount: '120000001',
        reason: 'The record does not support charging the full repair.',
      }),
    /cannot exceed/,
  );
  s.run('arbitrator', {
    type: 'award',
    amount: '60000000',
    reason: 'Both condition records support only part of the repair.',
  });
  assert.equal(s.state.security.assets, '3000000000');
  assert.equal(s.state.settlement, null);
  s.execute('arbitrator', 'settle');
  assert.deepEqual(s.state.settlement, { tenant: '2940000000', landlord: '60000000' });
});

test('authorization expiry and concurrent financial plans cannot bypass reservations', () => {
  const s = scenario('robinhood');
  s.run('tenant', { type: 'accept' });
  s.run('landlord', { type: 'accept' });
  s.run('tenant', { type: 'plan', kind: 'fund' });
  const id = s.state.operations[0].id;
  assert.throws(
    () =>
      applyCommand(
        s.state,
        { subject: 'session-123:tenant', role: 'tenant' },
        { type: 'authorize', operationId: id },
        'late-command',
        1120000,
      ),
    /expired/,
  );
  s.run('tenant', { type: 'authorize', operationId: id });
  assert.throws(() => s.run('tenant', { type: 'plan', kind: 'fund' }), /Reconcile/);
  assert.equal(s.state.security.assets, '0');
  assert.throws(
    () => reconcileFixture({ ...s.state, mode: 'connected' }, id, 1000001),
    /cannot settle a connected/,
  );
});

test('native amounts preserve precision beyond JavaScript safe integers', () => {
  assert.equal(parseAmount('9007199254740993.123456'), '9007199254740993123456');
  assert.equal(displayAmount('9007199254740993123456'), '9,007,199,254,740,993.12');
  for (const value of ['1e6', '-1', '1.0000001', ' 1', 'NaN', '01'])
    assert.throws(() => parseAmount(value));
});

test('optional personal savings are tenant-owned and never increase rental security', () => {
  const s = scenario('solana');
  const security = structuredClone(s.state.security);
  assert.throws(() => s.execute('landlord', 'contribute', '25000000'), /assigned tenant/);
  assert.throws(() => s.execute('tenant', 'contribute', '0'), /personal savings/);
  s.execute('tenant', 'contribute', '25000000');
  const contribution = s.state.operations[0];
  assert.deepEqual(s.state.security, security);
  assert.equal(s.state.personal.cash, '25000000');
  assert.equal(s.state.personal.contributed, '25000000');
  assert.deepEqual(reconcileFixture(s.state, contribution.id, 1000002), s.state);
  s.execute('tenant', 'buy', '25000000');
  assert.equal(s.state.personal.cash, '0');
  assert.equal(summary(s.state).investmentValue, '25000000');
  assert.deepEqual(s.state.security, security);
});
