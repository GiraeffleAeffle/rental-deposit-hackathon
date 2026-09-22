import { address } from "@solana/kit";
import { atomic } from "./amounts.ts";
import { SOLANA_MAINNET_MANIFEST, type Availability } from "./manifest.ts";

export type InvestmentDirection = "buy" | "sell";
export type JupiterQuote = {
  direction: InvestmentDirection; inputMint: string; outputMint: string; inputAtomic: string; quotedOutputAtomic: string;
  requestId: string; router: "metis" | "jupiterz" | "dflow" | "okx";
  feeBps: number; feeMint: string; observedAtMs: number;
  /** null = price only; empty string = router could quote but could not build. */
  transaction: string | null;
  taker?: string; payer?: string; receiver?: string;
  lastValidBlockHeight?: string; expireAt?: string;
  errorCode?: number;
};
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Jupiter response");
  return value as Record<string, unknown>;
}
function textField(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("Missing Jupiter response field");
  return value;
}
export function investmentPair(direction: InvestmentDirection) {
  if (direction !== "buy" && direction !== "sell") throw new Error("Invalid investment direction");
  const { deposit, investment } = SOLANA_MAINNET_MANIFEST;
  return direction === "buy" ? { inputMint: deposit.mint, outputMint: investment.mint } : { inputMint: investment.mint, outputMint: deposit.mint };
}
export type QuoteRequest = {
  direction: InvestmentDirection; inputAtomic: string;
  genesisHash: string; nowMs: number;
  apiKey?: string;
  taker?: string; payer?: string;
  /** Default is price-only. A transaction build is still read-only and never submitted here. */
  build?: boolean;
};
export function parseJupiterQuote(payload: unknown, request: QuoteRequest): JupiterQuote {
  const row = record(payload);
  const pair = investmentPair(request.direction);
  if (row.inputMint !== pair.inputMint || row.outputMint !== pair.outputMint || row.inAmount !== request.inputAtomic) throw new Error("Jupiter changed the requested asset or amount");
  atomic(row.inAmount, false); atomic(row.outAmount, false);
  if (typeof row.transaction !== "string" && row.transaction !== null) throw new Error("Missing transaction availability");
  if (!["metis", "jupiterz", "dflow", "okx"].includes(String(row.router))) throw new Error("Unsupported Jupiter router");
  if (!Number.isInteger(row.feeBps) || Number(row.feeBps) < 0 || Number(row.feeBps) > 1000) throw new Error("Invalid Jupiter fees");
  if (row.feeMint !== pair.inputMint && row.feeMint !== pair.outputMint) throw new Error("Unexpected fee asset");
  if (request.build && (!request.taker || !request.payer || request.taker === request.payer)) throw new Error("A separate fee sponsor is required");
  if (request.build && row.router !== "metis") throw new Error("Sponsored orders currently require Metis");
  const height = row.lastValidBlockHeight === null || row.lastValidBlockHeight === undefined ? undefined
    : typeof row.lastValidBlockHeight === "number" && Number.isSafeInteger(row.lastValidBlockHeight) && row.lastValidBlockHeight >= 0
      ? String(row.lastValidBlockHeight) : row.lastValidBlockHeight;
  if (height !== undefined) atomic(height);
  if (!request.build && row.transaction !== null) throw new Error("Price request unexpectedly returned a transaction");
  return { ...pair, direction: request.direction, inputAtomic: request.inputAtomic, quotedOutputAtomic: textField(row.outAmount),
    requestId: textField(row.requestId), router: row.router as JupiterQuote["router"], feeBps: row.feeBps as number,
    feeMint: row.feeMint as string, transaction: row.transaction, observedAtMs: request.nowMs,
    ...(request.build ? { taker: request.taker, payer: request.payer, receiver: request.taker } : {}),
    ...(height === undefined ? {} : { lastValidBlockHeight: height as string }),
    ...(typeof row.expireAt === "string" ? { expireAt: row.expireAt } : {}),
    ...(typeof row.errorCode === "number" ? { errorCode: row.errorCode } : {}),
  };
}

/** Fetches quotes/builds only. Signing belongs to the passkey wallet, submission to durable operations. */
export async function quoteInvestment(request: QuoteRequest, fetcher: typeof fetch = fetch): Promise<Availability<JupiterQuote>> {
  atomic(request.inputAtomic, false);
  if (request.genesisHash !== SOLANA_MAINNET_MANIFEST.genesisHash) return { available: false, reason: "issuer-route-has-no-verified-test-cluster" };
  if (!request.apiKey) return { available: false, reason: "jupiter-api-key-not-configured" };
  if (!Number.isSafeInteger(request.nowMs)) throw new Error("Invalid quote timestamp");
  const pair = investmentPair(request.direction);
  const params = new URLSearchParams({ ...pair, amount: request.inputAtomic });
  if (request.build) {
    if (!request.taker || !request.payer || request.taker === request.payer) return { available: false, reason: "separate-fee-sponsor-required" };
    params.set("taker", address(request.taker)); params.set("payer", address(request.payer)); params.set("receiver", address(request.taker));
  }
  try {
    const response = await fetcher(`https://api.jup.ag/swap/v2/order?${params}`, { headers: { "x-api-key": request.apiKey }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return { available: false, reason: `jupiter-http-${response.status}` };
    return { available: true, value: parseJupiterQuote(await response.json(), request) };
  } catch { return { available: false, reason: "jupiter-response-unavailable-or-invalid" }; }
}

export function validateQuoteForAuthorization(quote: JupiterQuote, authorization: {
  direction: InvestmentDirection; inputAtomic: string; minimumOutputAtomic: string;
  tenant: string; sponsor: string; nowMs: number; currentBlockHeight: string;
  eligibleUntilMs: number; eligibility: "eligible" | "ineligible" | "unknown";
  maxFeeBps: number;
}) {
  const minimum = atomic(authorization.minimumOutputAtomic, false);
  atomic(authorization.inputAtomic, false); atomic(authorization.currentBlockHeight);
  const pair = investmentPair(authorization.direction);
  if (authorization.eligibility !== "eligible" || authorization.eligibleUntilMs <= authorization.nowMs) throw new Error("Issuer eligibility unavailable or expired");
  if (quote.direction !== authorization.direction || quote.inputMint !== pair.inputMint || quote.outputMint !== pair.outputMint || quote.inputAtomic !== authorization.inputAtomic || atomic(quote.quotedOutputAtomic) < minimum) throw new Error("Quote differs from authorization");
  if (quote.taker !== authorization.tenant || quote.receiver !== authorization.tenant || quote.payer !== authorization.sponsor || authorization.tenant === authorization.sponsor || quote.router !== "metis") throw new Error("Wrong signer, recipient, sponsor or route");
  if (!quote.transaction) throw new Error(quote.transaction === null ? "Quote has no transaction" : "Router could not build transaction");
  if (!Number.isSafeInteger(authorization.nowMs) || quote.observedAtMs > authorization.nowMs || authorization.nowMs - quote.observedAtMs > 15_000) throw new Error("Quote expired");
  if (!quote.lastValidBlockHeight || atomic(quote.lastValidBlockHeight) <= atomic(authorization.currentBlockHeight)) throw new Error("Transaction block height expired or unavailable");
  if (!Number.isInteger(authorization.maxFeeBps) || authorization.maxFeeBps < 0 || quote.feeBps > authorization.maxFeeBps) throw new Error("Quote fee exceeds authorization");
  return { transactionBase64: quote.transaction, requestId: quote.requestId, lastValidBlockHeight: quote.lastValidBlockHeight,
    /** This is an economic check. inspectInvestmentTransaction must validate bytes and simulation next. */
    requiresTransactionInspection: true as const };
}

/** No live execution is enabled by this prototype. Fixture venues must label their evidence. */
export function investmentExecutionAvailability(): Availability<never> {
  return { available: false, reason: "mainnet-financial-actions-disabled-no-verified-issuer-devnet-route" };
}
