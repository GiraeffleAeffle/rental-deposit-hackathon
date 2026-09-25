import {
  quoteInvestment,
  SOLANA_MAINNET_MANIFEST,
  type JupiterQuote,
} from '../finance/solana/index.ts';

export function createPriceQuoteReader(read = quoteInvestment, now = Date.now) {
  const cache = new Map<string, { until: number; quote: JupiterQuote }>();
  let nextRequestAt = 0;
  return async function getPriceQuote(inputAtomic: string, apiKey?: string) {
    if (!['5000000', '10000000', '25000000'].includes(inputAtomic))
      return { available: false as const, reason: 'Choose a 5, 10 or 25 USDC price comparison.' };
    const time = now(),
      cached = cache.get(inputAtomic);
    if (cached && cached.until > time)
      return {
        available: true as const,
        quote: cached.quote,
        evidence: 'price-only' as const,
        cached: true,
      };
    if (time < nextRequestAt)
      return { available: false as const, reason: 'Quote rate limit: retry in a few seconds.' };
    nextRequestAt = time + (apiKey ? 1100 : 2200);
    const result = await read({
      direction: 'buy',
      inputAtomic,
      genesisHash: SOLANA_MAINNET_MANIFEST.genesisHash,
      nowMs: time,
      apiKey,
      build: false,
    });
    if (!result.available) return result;
    if (result.value.transaction !== null)
      throw new Error('A price lookup must not build a financial transaction.');
    cache.set(inputAtomic, { until: time + 30000, quote: result.value });
    return {
      available: true as const,
      quote: result.value,
      evidence: 'price-only' as const,
      cached: false,
    };
  };
}
export const readPriceQuote = createPriceQuoteReader();
