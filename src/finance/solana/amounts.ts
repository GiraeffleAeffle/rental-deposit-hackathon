/** Chain balances stay canonical decimal atomic-unit strings at the app boundary. */
export type Atomic = string;
export const U64_MAX = (1n << 64n) - 1n;

export function atomic(value: unknown, allowZero = true): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error("Amount must be a canonical nonnegative atomic-unit string");
  }
  const amount = BigInt(value);
  if (amount > U64_MAX || (!allowZero && amount === 0n)) throw new Error("Amount exceeds token range");
  return amount;
}

export function receiptValue(receipts: Atomic, supply: Atomic, netLiquidityScaled: string): Atomic {
  const shares = atomic(receipts);
  if (shares === 0n) return "0";
  const denominator = atomic(supply, false);
  if (!/^[1-9][0-9]*$/.test(netLiquidityScaled)) throw new Error("Invalid reserve liquidity");
  const liquidity = BigInt(netLiquidityScaled);
  if (liquidity >= 1n << 128n) throw new Error("Reserve liquidity exceeds u128");
  const value = shares * liquidity / denominator / (1n << 60n);
  if (value > U64_MAX) throw new Error("Receipt value exceeds token range");
  return value.toString();
}

export function releasableEarnings(input: {
  idleAtomic: Atomic; receiptValueAtomic: Atomic; requiredSecurityAtomic: Atomic;
  policyPermits: boolean; phase: string; valuationFresh: boolean;
}): { availableAtomic: Atomic; reason?: string } {
  const idle = atomic(input.idleAtomic);
  const value = atomic(input.receiptValueAtomic);
  const required = atomic(input.requiredSecurityAtomic, false);
  if (!input.policyPermits || input.phase !== "active") return { availableAtomic: "0", reason: "policy-or-tenancy-state" };
  if (!input.valuationFresh) return { availableAtomic: "0", reason: "stale-valuation" };
  const total = idle + value;
  if (total > U64_MAX) throw new Error("Escrow total exceeds token range");
  if (total < required) return { availableAtomic: "0", reason: "security-shortfall" };
  return { availableAtomic: (total - required < idle ? total - required : idle).toString() };
}

/** Token-2022 scaling changes displayed economic exposure, never the spendable raw balance. */
export function scaledExposure(rawAtomic: Atomic, decimals: number, multiplier: string, outputDecimals = 8): string {
  const raw = atomic(rawAtomic);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18 || !Number.isInteger(outputDecimals) || outputDecimals < 0 || outputDecimals > 18) throw new Error("Invalid decimals");
  if (!/^[0-9]+(?:\.[0-9]+)?$/.test(multiplier)) throw new Error("Invalid scaled UI multiplier");
  const [whole, fraction = ""] = multiplier.split(".");
  if (fraction.length > 30) throw new Error("Unsupported multiplier precision");
  const numerator = BigInt(whole + fraction);
  if (numerator <= 0n) throw new Error("Multiplier must be positive");
  const scaled = raw * numerator * 10n ** BigInt(outputDecimals) / (10n ** BigInt(decimals + fraction.length));
  if (outputDecimals === 0) return scaled.toString();
  const digits = scaled.toString().padStart(outputDecimals + 1, "0");
  return `${digits.slice(0, -outputDecimals)}.${digits.slice(-outputDecimals)}`;
}
