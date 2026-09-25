import { getAddress, isHex, type Address, type Hex } from 'viem';
import { atomic, robinhoodMainnet, sameAddress } from './manifest.ts';

export interface StockRouteConfig {
  apiKey?: string;
  rwaAccessEnabled: boolean;
  /** These lists are operator-reviewed deployment metadata, not client-supplied quote fields. */
  allowedTransactionTargets: readonly Address[];
  allowedAllowanceTargets: readonly Address[];
  enabledStocks: readonly Address[];
}
export interface StockTradeRequest {
  side: 'buy' | 'sell';
  personalWallet: Address;
  stock: Address;
  sellAmount: string;
  slippageBps: number;
  /** Must come from a server-verified profile; a browser checkbox is not authorization. */
  eligibility: { verified: boolean; customerId: string; expiresAt: number };
}
export type StockQuoteResult =
  | { status: 'unavailable'; reason: string }
  | {
      status: 'quote';
      chainId: 4663;
      taker: Address;
      sellToken: Address;
      buyToken: Address;
      sellAmount: string;
      buyAmount: string;
      minBuyAmount: string;
      observedBlock: string;
      requestedAt: number;
      refreshBy: number;
      approval: { spender: Address; amount: string } | null;
      transaction: { to: Address; data: Hex; value: '0'; gas: string | null };
      fees: unknown;
      execution: 'requires-fresh-simulation-and-tenant-signature';
    };

/** Server-only, fail-closed quote preparation. This helper never signs or submits a trade. */
export async function quoteStockTrade(
  config: StockRouteConfig,
  request: StockTradeRequest,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<StockQuoteResult> {
  if (!config.apiKey || !config.rwaAccessEnabled)
    return { status: 'unavailable', reason: 'Authorized 0x RWA access is not configured' };
  if (
    !request.eligibility.verified ||
    !request.eligibility.customerId ||
    request.eligibility.expiresAt <= now
  )
    return {
      status: 'unavailable',
      reason: 'A current, verified eligible customer profile is required',
    };
  if (!config.enabledStocks.some((address) => sameAddress(address, request.stock)))
    return { status: 'unavailable', reason: 'This instrument is not enabled for the integration' };
  if (!config.allowedTransactionTargets.length || !config.allowedAllowanceTargets.length)
    return { status: 'unavailable', reason: 'Robinhood route contracts have not been reviewed' };
  if (
    (request.side !== 'buy' && request.side !== 'sell') ||
    atomic(request.sellAmount) === 0n ||
    !Number.isInteger(request.slippageBps) ||
    request.slippageBps < 0 ||
    request.slippageBps > 100
  )
    throw new Error('Invalid trade amount or slippage ceiling');
  const taker = getAddress(request.personalWallet);
  const sellToken =
    request.side === 'buy' ? robinhoodMainnet.asset.address : getAddress(request.stock);
  const buyToken =
    request.side === 'buy' ? getAddress(request.stock) : robinhoodMainnet.asset.address;
  const params = new URLSearchParams({
    chainId: '4663',
    sellToken,
    buyToken,
    sellAmount: request.sellAmount,
    taker,
    recipient: taker,
    slippageBps: String(request.slippageBps),
  });
  try {
    const response = await fetcher(`https://api.0x.org/swap/allowance-holder/quote?${params}`, {
      headers: { '0x-api-key': config.apiKey, '0x-version': 'v2' },
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });
    if (!response.ok)
      return { status: 'unavailable', reason: `Quote provider returned HTTP ${response.status}` };
    const body = (await response.json()) as Record<string, unknown>;
    if (body.liquidityAvailable !== true)
      return { status: 'unavailable', reason: 'No executable liquidity was returned' };
    const tx = body.transaction as Record<string, unknown> | undefined;
    const issues = body.issues as Record<string, unknown> | undefined;
    if (!tx || issues?.simulationIncomplete === true || issues?.balance)
      return {
        status: 'unavailable',
        reason: 'Quote simulation or personal cash balance is incomplete',
      };
    if (
      (body.chainId !== undefined && String(body.chainId) !== '4663') ||
      !sameAddress(String(body.sellToken), sellToken) ||
      !sameAddress(String(body.buyToken), buyToken) ||
      String(body.sellAmount) !== request.sellAmount ||
      (body.taker && !sameAddress(String(body.taker), taker))
    )
      return { status: 'unavailable', reason: 'Quote changed the authorized trade' };
    const target = getAddress(String(tx.to));
    const spender = getAddress(String(body.allowanceTarget));
    if (
      !config.allowedTransactionTargets.some((address) => sameAddress(address, target)) ||
      !config.allowedAllowanceTargets.some((address) => sameAddress(address, spender)) ||
      String(tx.value) !== '0' ||
      !isHex(tx.data) ||
      tx.data.length <= 10
    )
      return {
        status: 'unavailable',
        reason: 'Quote returned an unapproved execution target or native-token spend',
      };
    const buyAmount = String(body.buyAmount),
      minBuyAmount = String(body.minBuyAmount);
    if (
      atomic(minBuyAmount) === 0n ||
      atomic(minBuyAmount) > atomic(buyAmount) ||
      atomic(minBuyAmount) < (atomic(buyAmount) * (10_000n - BigInt(request.slippageBps))) / 10_000n
    )
      throw new Error('Invalid minimum output');
    const allowance = issues?.allowance as { actual?: string; spender?: string } | null | undefined;
    if (allowance?.spender && !sameAddress(allowance.spender, spender))
      throw new Error('Allowance target mismatch');
    return {
      status: 'quote',
      chainId: 4663,
      taker,
      sellToken,
      buyToken,
      sellAmount: request.sellAmount,
      buyAmount,
      minBuyAmount,
      observedBlock: atomic(String(body.blockNumber)).toString(),
      requestedAt: now,
      refreshBy: now + 30_000,
      approval: allowance ? { spender, amount: request.sellAmount } : null,
      transaction: {
        to: target,
        data: tx.data,
        value: '0',
        gas: tx.gas ? atomic(String(tx.gas)).toString() : null,
      },
      fees: body.fees ?? null,
      execution: 'requires-fresh-simulation-and-tenant-signature',
    };
  } catch {
    return {
      status: 'unavailable',
      reason: 'Quote could not be validated; no trade was submitted',
    };
  }
}
