import { getAddressDecoder, getCompiledTransactionMessageDecoder, getTransactionDecoder } from "@solana/kit";
import { atomic } from "./amounts.ts";
import { SOLANA_IDS, SOLANA_MAINNET_MANIFEST } from "./manifest.ts";
import { messageDigest } from "./reconcile.ts";

const METIS_PROGRAM = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
const COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111";
const LOOKUP_OWNER = "AddressLookupTab1e1111111111111111111111111";

/** A deliberately narrow ABI decoder: one reviewed Whirlpool hop, exact input. Unknown routes fail closed. */
export function inspectMetisRoute(data: Uint8Array, keys: readonly string[], bounds: {
  tenant: string; inputAccount: string; outputAccount: string; inputMint: string; outputMint: string;
  maximumInputAtomic: string; minimumOutputAtomic: string;
}) {
  const is = (discriminator: number[]) => discriminator.every((byte, index) => data[index] === byte);
  const shared = is([193, 32, 155, 51, 65, 214, 156, 129]);
  if (!shared && !is([229, 23, 203, 151, 122, 227, 173, 42])) throw new Error("Unreviewed Metis instruction variant");
  if (data.length < 36) throw new Error("Truncated route");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = shared ? 9 : 8;
  if (view.getUint32(offset, true) !== 1) throw new Error("Only one reviewed venue hop is supported");
  offset += 4;
  const variant = data[offset++];
  if (variant !== 17 && variant !== 47) throw new Error("Unreviewed venue ABI");
  if (data[offset++] > 1) throw new Error("Invalid Whirlpool direction");
  if (variant === 47 && data[offset++] !== 0) throw new Error("Additional Token-2022 hook accounts need review");
  if (data[offset++] !== 100 || data[offset++] !== 0 || data[offset++] !== 1 || data.length !== offset + 19) throw new Error("Invalid or appended route encoding");
  const amount = view.getBigUint64(offset, true), quotedOut = view.getBigUint64(offset + 8, true);
  const slippageBps = view.getUint16(offset + 16, true), platformFeeBps = data[offset + 18];
  if (slippageBps > 100) throw new Error("Route slippage exceeds one percent");
  // Conservative bounds cover a platform fee collected on either leg.
  const maximumDebit = amount + (amount * BigInt(platformFeeBps) + 9999n) / 10000n;
  const minimumNet = quotedOut * BigInt(10000 - slippageBps) / 10000n * BigInt(10000 - platformFeeBps) / 10000n;
  if (amount === 0n || maximumDebit > atomic(bounds.maximumInputAtomic, false) || minimumNet < atomic(bounds.minimumOutputAtomic, false)) throw new Error("Encoded route exceeds economic authorization");
  if (shared ? keys[2] !== bounds.tenant || keys[3] !== bounds.inputAccount || keys[6] !== bounds.outputAccount || keys[7] !== bounds.inputMint || keys[8] !== bounds.outputMint
    : keys[1] !== bounds.tenant || keys[2] !== bounds.inputAccount || keys[3] !== bounds.outputAccount || keys[5] !== bounds.outputMint) throw new Error("Encoded route redirects trade accounts");
  return { maximumDebitAtomic: maximumDebit.toString(), minimumNetAtomic: minimumNet.toString() };
}
export type SimulationAccount = { owner: string; lamports: string; data: Uint8Array; executable: boolean } | null;
export type SimulationAudit = {
  genesisHash: string; messageSha256: string; observedAtMs: number; err: unknown | null;
  /** The RPC simulation must return every writable account, keyed by the resolved address. */
  before: Readonly<Record<string, SimulationAccount>>; after: Readonly<Record<string, SimulationAccount>>;
};
function rawToken(value: Exclude<SimulationAccount, null>) {
  if ((value.owner !== SOLANA_IDS.token && value.owner !== SOLANA_IDS.token2022) || value.executable || value.data.length < 165) return undefined;
  const data = value.data;
  return { mint: getAddressDecoder().decode(data.subarray(0, 32)), owner: getAddressDecoder().decode(data.subarray(32, 64)),
    amount: new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(64, true),
    authorityFields: [...data.subarray(72, 108), ...data.subarray(129, 165)].join(","), initialized: data[108] === 1 };
}

/** Inspect exact bytes after lookup resolution and simulation, before the wallet can authorize. */
export async function inspectInvestmentTransaction(input: {
  bytes: Uint8Array; tenant: string; sponsor: string;
  inputAccount: string; outputAccount: string; inputMint: string; outputMint: string;
  maximumInputAtomic: string; minimumOutputAtomic: string; maximumSponsorLamports: string;
  nowMs: number;
  lookupTables: Readonly<Record<string, { owner: string; addresses: readonly string[]; deactivationSlot: string }>>;
  simulation: SimulationAudit;
}) {
  const transaction = getTransactionDecoder().decode(input.bytes);
  const message = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
  const hash = await messageDigest(input.bytes);
  if (message.version !== 0 || input.tenant === input.sponsor || message.staticAccounts[0] !== input.sponsor) throw new Error("Wrong transaction version or fee payer");
  const signerAccounts = message.staticAccounts.slice(0, message.header.numSignerAccounts);
  if (signerAccounts.length !== 2 || !signerAccounts.includes(input.tenant as typeof signerAccounts[number]) || !signerAccounts.includes(input.sponsor as typeof signerAccounts[number])) throw new Error("Unexpected required signer");
  const loadedWritable: string[] = [], loadedReadonly: string[] = [];
  for (const lookup of message.addressTableLookups ?? []) {
    const table = input.lookupTables[lookup.lookupTableAddress];
    if (!table || table.owner !== LOOKUP_OWNER || table.deactivationSlot !== "18446744073709551615") throw new Error("Unresolved or deactivating lookup table");
    for (const [indexes, destination] of [[lookup.writableIndexes, loadedWritable], [lookup.readonlyIndexes, loadedReadonly]] as const) {
      for (const index of indexes) {
        if (!table.addresses[index]) throw new Error("Invalid lookup index");
        destination.push(table.addresses[index]);
      }
    }
  }
  const accounts = [...message.staticAccounts, ...loadedWritable, ...loadedReadonly];
  if (new Set(accounts).size !== accounts.length) throw new Error("Duplicate account aliases");
  const writable = message.staticAccounts.filter((_, index) => index < message.header.numSignerAccounts
    ? index < message.header.numSignerAccounts - message.header.numReadonlySignerAccounts
    : index < message.staticAccounts.length - message.header.numReadonlyNonSignerAccounts).concat(loadedWritable as typeof message.staticAccounts);
  let swaps = 0;
  for (const instruction of message.instructions) {
    const program = accounts[instruction.programAddressIndex];
    if (!program || (instruction.accountIndices ?? []).some(index => !accounts[index])) throw new Error("Invalid instruction account index");
    if (program === METIS_PROGRAM) {
      inspectMetisRoute(new Uint8Array(instruction.data ?? []), (instruction.accountIndices ?? []).map(index => accounts[index]), input);
      swaps += 1;
    }
    else if (program === COMPUTE_BUDGET) {
      if (!instruction.data || ![2, 3].includes(instruction.data[0])) throw new Error("Unreviewed compute budget instruction");
    } else if (program === SOLANA_IDS.associatedToken) {
      const keys = (instruction.accountIndices ?? []).map(index => accounts[index]);
      if (!instruction.data || instruction.data.length !== 1 || instruction.data[0] !== 1 || keys[0] !== input.sponsor || keys[1] !== input.outputAccount || keys[2] !== input.tenant || keys[3] !== input.outputMint) throw new Error("Unreviewed account creation");
    } else throw new Error("Unreviewed top-level instruction; use a reviewed route builder");
  }
  if (swaps !== 1) throw new Error("Exactly one reviewed Metis swap is required");
  if (!writable.includes(input.inputAccount as typeof writable[number]) || !writable.includes(input.outputAccount as typeof writable[number])) throw new Error("Trade accounts are not writable");
  const simulation = input.simulation;
  if (simulation.genesisHash !== SOLANA_MAINNET_MANIFEST.genesisHash || simulation.messageSha256 !== hash || simulation.err !== null || simulation.observedAtMs > input.nowMs || input.nowMs - simulation.observedAtMs > 10_000) throw new Error("Fresh simulation of these exact bytes is required");
  const maxInput = atomic(input.maximumInputAtomic, false), minOutput = atomic(input.minimumOutputAtomic, false), maxSponsor = atomic(input.maximumSponsorLamports);
  let inputDelta: bigint | undefined, outputDelta: bigint | undefined;
  for (const key of writable) {
    if (!(key in simulation.before) || !(key in simulation.after)) throw new Error("Missing writable account simulation");
    const before = simulation.before[key], after = simulation.after[key];
    if (key === input.sponsor) {
      if (!before || !after || atomic(before.lamports) - atomic(after.lamports) > maxSponsor) throw new Error("Sponsor budget exceeded");
    }
    if (key === input.tenant && before && (!after || atomic(after.lamports) < atomic(before.lamports))) throw new Error("Tenant would pay native fees");
    const pre = before && rawToken(before), post = after && rawToken(after);
    if (pre?.owner === input.tenant) {
      if (!post || post.owner !== pre.owner || post.mint !== pre.mint || !post.initialized || post.authorityFields !== pre.authorityFields) throw new Error("Tenant token authority or account state changed");
      if (key !== input.inputAccount && post.amount < pre.amount) throw new Error("Unexpected tenant token loss");
    }
    if (key === input.inputAccount) {
      if (!pre || !post || pre.owner !== input.tenant || post.owner !== input.tenant || pre.mint !== input.inputMint || post.mint !== input.inputMint) throw new Error("Wrong input token account");
      inputDelta = pre.amount - post.amount;
    }
    if (key === input.outputAccount) {
      if (!post || post.owner !== input.tenant || post.mint !== input.outputMint || !post.initialized || (pre && (pre.owner !== input.tenant || pre.mint !== input.outputMint))) throw new Error("Wrong output recipient");
      outputDelta = post.amount - (pre?.amount ?? 0n);
    }
  }
  if (inputDelta === undefined || inputDelta <= 0n || inputDelta > maxInput || outputDelta === undefined || outputDelta < minOutput) throw new Error("Simulated trade exceeds economic authorization");
  return { messageSha256: hash, inputAtomic: inputDelta.toString(), outputAtomic: outputDelta.toString(), signerAccounts, writableAccounts: writable };
}
