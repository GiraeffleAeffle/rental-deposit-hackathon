import { getAddressDecoder } from "@solana/kit";
import { atomic, receiptValue } from "./amounts.ts";
import { deriveKaminoAddresses, SOLANA_IDS, type DeploymentManifest } from "./manifest.ts";

export type AccountObservation = {
  address: string; owner: string; executable: boolean; data: Uint8Array;
};
export type ObservationContext = { genesisHash: string; slot: string; observedAtMs: number };

function equalBytes(data: Uint8Array, prefix: readonly number[]) {
  return prefix.every((byte, index) => data[index] === byte);
}
function reader(data: Uint8Array, size: number, discriminator?: readonly number[]) {
  if (data.length !== size || (discriminator && !equalBytes(data, discriminator))) throw new Error("Account layout or discriminator mismatch");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    u64: (offset: number) => view.getBigUint64(offset, true),
    u128: (offset: number) => view.getBigUint64(offset, true) + (view.getBigUint64(offset + 8, true) << 64n),
    key: (offset: number) => getAddressDecoder().decode(data.subarray(offset, offset + 32)),
  };
}

/** Minimal, version-pinned decoder; Rust layout test pins all of these offsets to klend-interface. */
export function decodeKaminoReserve(account: AccountObservation) {
  if (account.owner !== SOLANA_IDS.klend || account.executable) throw new Error("Reserve has wrong program owner");
  const r = reader(account.data, 8624, [43, 242, 204, 202, 26, 247, 59, 127]);
  const available = r.u64(224);
  const net = (available << 60n) + r.u128(232) - r.u128(344) - r.u128(360) - r.u128(376);
  if (net < 0n || net >= 1n << 128n) throw new Error("Invalid net reserve liquidity");
  const oracles = [r.key(5112), r.key(5160), r.key(5192), r.key(5224)].filter(key => key !== SOLANA_IDS.system && key !== SOLANA_IDS.klend);
  return {
    address: account.address, market: r.key(32), mint: r.key(128), liquiditySupply: r.key(160),
    tokenProgram: r.key(408), decimals: r.u64(272).toString(), receiptMint: r.key(2560),
    collateralSupplyAtomic: r.u64(2592).toString(), availableAtomic: available.toString(),
    netLiquidityScaled: net.toString(), lastUpdateSlot: r.u64(16).toString(), stale: account.data[24] !== 0,
    active: account.data[4856] === 0, emergency: account.data[4864] !== 0,
    permissionedOps: r.u64(5800).toString(), oracleAccounts: [...new Set(oracles)],
  };
}
export function decodeKaminoMarket(account: AccountObservation) {
  if (account.owner !== SOLANA_IDS.klend || account.executable) throw new Error("Market has wrong program owner");
  const r = reader(account.data, 4664, [246, 114, 50, 98, 72, 157, 28, 120]);
  return { address: account.address, emergency: account.data[122] !== 0, permissionedOps: r.u64(3432).toString() };
}
export function decodeClassicTokenAccount(account: AccountObservation) {
  if (account.owner !== SOLANA_IDS.token || account.executable) throw new Error("Token account has wrong program owner");
  const r = reader(account.data, 165);
  return { address: account.address, mint: r.key(0), authority: r.key(32), amountAtomic: r.u64(64).toString(), initialized: account.data[108] === 1, frozen: account.data[108] === 2 };
}

export type MintObservation = {
  address: string; owner: string; decimals: number; initialized: boolean;
  supplyAtomic: string;
  extensions?: readonly string[];
  paused?: boolean;
  defaultAccountState?: "initialized" | "frozen" | "uninitialized";
  transferHookProgram?: string | null;
  permanentDelegate?: string | null;
  scaledUiMultiplier?: string;
};
export function validateMintObservation(observed: MintObservation, expected: {
  mint: string; tokenProgram: string; decimals: number;
  /** A deployment review must explicitly approve issuer powers. Missing is never auto-approval. */
  approvedExtensions?: readonly string[];
  approvedPermanentDelegate?: string | null;
  approvedTransferHook?: string | null;
}) {
  if (observed.address !== expected.mint || observed.owner !== expected.tokenProgram || observed.decimals !== expected.decimals || !observed.initialized) throw new Error("Wrong or uninitialized token mint");
  atomic(observed.supplyAtomic);
  const extensions = observed.extensions ?? [];
  if (observed.owner === SOLANA_IDS.token && extensions.length > 0) throw new Error("Classic mint cannot declare Token-2022 extensions");
  if (observed.owner === SOLANA_IDS.token2022 && (!expected.approvedExtensions || extensions.some(name => !expected.approvedExtensions!.includes(name)))) throw new Error("Unreviewed issuer extension");
  if (observed.paused || observed.defaultAccountState === "frozen" || observed.defaultAccountState === "uninitialized") throw new Error("Issuer transfer restrictions are active");
  if ((observed.transferHookProgram ?? null) !== (expected.approvedTransferHook ?? null)) throw new Error("Transfer hook changed");
  if ((observed.permanentDelegate ?? null) !== (expected.approvedPermanentDelegate ?? null)) throw new Error("Permanent delegate changed");
  if (extensions.includes("permanentDelegate") && !observed.permanentDelegate) throw new Error("Permanent delegate observation missing");
  if (extensions.includes("scaledUiAmountConfig") && !/^[0-9]+(?:\.[0-9]+)?$/.test(observed.scaledUiMultiplier ?? "")) throw new Error("Scaled UI multiplier unavailable");
  if (observed.scaledUiMultiplier && BigInt(observed.scaledUiMultiplier.replace(".", "")) <= 0n) throw new Error("Invalid scaled UI multiplier");
  return observed;
}

export async function validateKaminoAccounts(input: {
  manifest: DeploymentManifest;
  context: ObservationContext;
  nowMs: number;
  reserve: AccountObservation; market: AccountObservation; liquiditySupply: AccountObservation;
  program: Pick<AccountObservation, "address" | "executable" | "owner">;
  trackedReceiptAtomic: string;
}) {
  const { manifest, context } = input;
  atomic(context.slot);
  if (context.genesisHash !== manifest.genesisHash) throw new Error("Wrong genesis hash");
  if (!Number.isSafeInteger(input.nowMs) || !Number.isSafeInteger(context.observedAtMs) || context.observedAtMs > input.nowMs || input.nowMs - context.observedAtMs > manifest.maxObservationAgeMs) throw new Error("Stale account observation");
  const programOwners = ["BPFLoaderUpgradeab1e11111111111111111111111", "BPFLoader2111111111111111111111111111111111"];
  if (input.program.address !== SOLANA_IDS.klend || !input.program.executable || !programOwners.includes(input.program.owner)) throw new Error("Wrong lending program");
  const reserve = decodeKaminoReserve(input.reserve);
  const market = decodeKaminoMarket(input.market);
  const liquidity = decodeClassicTokenAccount(input.liquiditySupply);
  const derived = await deriveKaminoAddresses(manifest.reserve, manifest.market);
  if (reserve.address !== manifest.reserve || market.address !== manifest.market || reserve.market !== manifest.market ||
    reserve.mint !== manifest.depositMint || reserve.decimals !== "6" || reserve.tokenProgram !== SOLANA_IDS.token ||
    reserve.receiptMint !== manifest.receiptMint ||
    reserve.liquiditySupply !== manifest.liquiditySupply ||
    derived.marketAuthority !== manifest.marketAuthority || liquidity.address !== manifest.liquiditySupply ||
    liquidity.mint !== manifest.depositMint || liquidity.authority !== manifest.marketAuthority || !liquidity.initialized || liquidity.frozen) throw new Error("Lending account identity mismatch");
  if (!reserve.active || reserve.emergency || market.emergency || reserve.permissionedOps !== "0" || market.permissionedOps !== "0") throw new Error("Lending operations unavailable");
  if (reserve.oracleAccounts.length !== manifest.oracleAccounts.length || reserve.oracleAccounts.some(key => !manifest.oracleAccounts.includes(key))) throw new Error("Oracle configuration changed");
  // An off-chain observation need not be refreshed in this exact slot; on-chain CPI must refresh again.
  if (BigInt(reserve.lastUpdateSlot) > BigInt(context.slot)) throw new Error("Future reserve slot");
  return { reserve, market, receiptValueAtomic: receiptValue(input.trackedReceiptAtomic, reserve.collateralSupplyAtomic, reserve.netLiquidityScaled),
    availableLiquidityAtomic: (BigInt(reserve.availableAtomic) < BigInt(liquidity.amountAtomic) ? reserve.availableAtomic : liquidity.amountAtomic),
    requiresRefresh: reserve.stale || reserve.lastUpdateSlot !== context.slot };
}
