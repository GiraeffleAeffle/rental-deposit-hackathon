import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balances, initialRental, parseCents, savingsProjection, transition } from './rental.ts';

test('a claim is neither an allocation nor a payout; unfunded requests are excluded', () => {
  assert.deepEqual(balances(initialRental()), {
    held: 80000,
    landlord: null,
    tenant: null,
    paid: 0,
    portfolioHeld: 200000,
    fundingOutstanding: 80000,
  });
  assert.throws(() => transition(initialRental(), { type: 'pay', role: 'landlord' }));
});

test('agreement conserves the balance and payout cannot execute twice', () => {
  const agreed = transition(initialRental(), { type: 'agree', role: 'tenant' });
  const before = balances(agreed);
  assert.equal(before.held, 80000);
  assert.equal(before.tenant! + before.landlord!, before.held);
  const paid = transition(agreed, { type: 'pay', role: 'landlord' });
  assert.equal(balances(paid).held, 0);
  assert.equal(balances(paid).paid, 80000);
  assert.equal(balances(paid).portfolioHeld, 120000);
  assert.throws(() => transition(paid, { type: 'pay', role: 'landlord' }));
});

test('a disputed case keeps money held until a reasoned human decision', () => {
  const disputed = transition(initialRental(), {
    type: 'dispute',
    role: 'tenant',
    reason: 'The marks appear in the original inspection.',
  });
  assert.equal(balances(disputed).held, 80000);
  assert.throws(() => transition(disputed, { type: 'pay', role: 'arbitrator' }));
  assert.throws(() =>
    transition(disputed, {
      type: 'award',
      role: 'landlord',
      cents: 6000,
      reason: 'I would like this amount.',
    }),
  );
  assert.throws(() =>
    transition(disputed, { type: 'award', role: 'arbitrator', cents: 6000, reason: '' }),
  );
  for (const cents of [-1, 12001, 0.1, NaN, Infinity]) {
    assert.throws(() =>
      transition(disputed, {
        type: 'award',
        role: 'arbitrator',
        cents,
        reason: 'Reviewed both condition records.',
      }),
    );
  }
  const awarded = transition(disputed, {
    type: 'award',
    role: 'arbitrator',
    cents: 6000,
    reason: 'The additional damage supports a partial allocation.',
  });
  assert.equal(balances(awarded).tenant, 74000);
  assert.equal(balances(awarded).landlord, 6000);
  assert.equal(balances(awarded).held, 80000);
  assert.equal(awarded.tenantResponse, disputed.tenantResponse);
  assert.notEqual(awarded.reason, awarded.tenantResponse);
});

test('role changes do not grant the landlord authority to approve their own claim', () => {
  assert.throws(() => transition(initialRental(), { type: 'agree', role: 'landlord' }));
  assert.throws(() =>
    transition(initialRental(), {
      type: 'dispute',
      role: 'arbitrator',
      reason: 'Inspection mismatch noted.',
    }),
  );
  assert.throws(() =>
    transition(initialRental(), {
      type: 'award',
      role: 'arbitrator',
      cents: 0,
      reason: 'No evidence of new damage.',
    }),
  );
});

test('money input is exact to cents and rejects exponent, signs, and hidden precision', () => {
  assert.equal(parseCents('120.01'), 12001);
  assert.equal(parseCents('0.1'), 10);
  assert.equal(parseCents('0'), 0);
  for (const text of ['', '-2', '1e2', '1.005', '$120', 'NaN', ' 12'])
    assert.equal(parseCents(text), null);
});

test('savings illustration starts with personal contributions, not the locked deposit', () => {
  assert.equal(savingsProjection(2500, 0, 0, 10).at(-1)?.balanceCents, 300000);
  assert.equal(savingsProjection(0, 2400, 0, 10).at(-1)?.balanceCents, 24000);
  assert.equal(savingsProjection(0, 0, 5, 10).at(-1)?.balanceCents, 0);
  assert.throws(() => savingsProjection(-1, 0, 5, 10));
});
