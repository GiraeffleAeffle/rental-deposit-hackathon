import test from 'node:test';
import assert from 'node:assert/strict';
import { createPriceQuoteReader } from './market-quotes.ts';
import type { JupiterQuote } from '../finance/solana/index.ts';
test('public price route is bounded, cached, throttled and cannot return a transaction', async () => {
  let now = 100000;
  let calls = 0;
  const reader = createPriceQuoteReader(
    async (request) => {
      calls++;
      assert.equal(request.build, false);
      assert.equal(request.taker, undefined);
      return {
        available: true,
        value: {
          inputAtomic: request.inputAtomic,
          transaction: null,
          observedAtMs: now,
        } as JupiterQuote,
      };
    },
    () => now,
  );
  assert.equal((await reader('10000000')).available, true);
  await reader('10000000');
  assert.equal(calls, 1);
  assert.equal((await reader('25000000')).available, false);
  now += 2300;
  assert.equal((await reader('25000000')).available, true);
  assert.equal((await reader('1000000000000000000000')).available, false);
  const unsafe = createPriceQuoteReader(async () => ({
    available: true,
    value: { transaction: 'signed-looking-bytes' } as JupiterQuote,
  }));
  await assert.rejects(() => unsafe('5000000'), /must not build/);
});
