import { getBase58Encoder, getTransactionDecoder } from "@solana/kit";
import { atomic } from "./amounts.ts";

export async function messageDigest(transactionBytes: Uint8Array): Promise<string> {
  const transaction = getTransactionDecoder().decode(transactionBytes);
  const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(transaction.messageBytes));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
export type RawTokenBalance = {
  accountIndex: number; mint: string; owner?: string;
  uiTokenAmount: { amount: string; decimals: number };
};
export type ExpectedTokenDelta = {
  account: string; mint: string; owner: string;
  direction: "credit" | "debit" | "unchanged";
  minimumAtomic: string; maximumAtomic: string;
  allowCreated?: boolean; allowClosed?: boolean;
};
export type ConfirmedTransaction = {
  signatures: readonly string[];
  messageSha256: string;
  accountKeys: readonly string[];
  slot: string;
  meta: null | { err: unknown | null; preTokenBalances?: readonly RawTokenBalance[]; postTokenBalances?: readonly RawTokenBalance[] };
};
export type SignatureReconciliation =
  | { status: "pending" | "unknown"; reason: string }
  | { status: "failed"; reason: string }
  | { status: "finalized"; signature: string; slot: string; deltas: readonly { account: string; signedAtomic: string }[] };

/** Compare RPC atomic deltas against the persisted authorization; API "Success" is not settlement. */
export function reconcileSolanaSignature(input: {
  signature: string; expectedGenesisHash: string; observedGenesisHash: string;
  expectedMessageSha256: string;
  signatureStatus: null | { confirmationStatus: "processed" | "confirmed" | "finalized" | null; err: unknown | null };
  transaction: ConfirmedTransaction | null;
  expectedDeltas: readonly ExpectedTokenDelta[];
}): SignatureReconciliation {
  try { if (getBase58Encoder().encode(input.signature).length !== 64) throw new Error(); }
  catch { return { status: "failed", reason: "invalid-signature" }; }
  if (input.expectedGenesisHash !== input.observedGenesisHash) return { status: "failed", reason: "wrong-network" };
  if (!input.signatureStatus) return { status: "unknown", reason: "signature-not-observed-do-not-resubmit-new-intent" };
  if (input.signatureStatus.err !== null) return { status: "failed", reason: "transaction-error" };
  if (input.signatureStatus.confirmationStatus !== "finalized") return { status: "pending", reason: "awaiting-finality" };
  const transaction = input.transaction;
  if (!transaction || !transaction.meta) return { status: "unknown", reason: "receipt-unavailable" };
  if (transaction.meta.err !== null) return { status: "failed", reason: "receipt-error" };
  if (transaction.signatures[0] !== input.signature || !/^[a-f0-9]{64}$/.test(input.expectedMessageSha256) || transaction.messageSha256 !== input.expectedMessageSha256) return { status: "failed", reason: "receipt-does-not-match-authorized-message" };
  if (transaction.meta.preTokenBalances === undefined || transaction.meta.postTokenBalances === undefined) return { status: "unknown", reason: "token-balance-evidence-missing" };
  try {
    atomic(transaction.slot);
    if (new Set(input.expectedDeltas.map(delta => delta.account)).size !== input.expectedDeltas.length) throw new Error("Duplicate expectation");
    const indexBalances = (rows: readonly RawTokenBalance[]) => {
      const map = new Map<string, RawTokenBalance>();
      for (const row of rows) {
        if (!Number.isSafeInteger(row.accountIndex) || row.accountIndex < 0 || row.accountIndex >= transaction.accountKeys.length) throw new Error("Invalid account index");
        const key = transaction.accountKeys[row.accountIndex];
        if (map.has(key)) throw new Error("Duplicate token balance");
        atomic(row.uiTokenAmount.amount);
        map.set(key, row);
      }
      return map;
    };
    const before = indexBalances(transaction.meta.preTokenBalances);
    const after = indexBalances(transaction.meta.postTokenBalances);
    const deltas = input.expectedDeltas.map(expected => {
      const min = atomic(expected.minimumAtomic); const max = atomic(expected.maximumAtomic);
      if (max < min) throw new Error("Invalid delta bounds");
      if (!transaction.accountKeys.includes(expected.account)) throw new Error("Recipient absent");
      const pre = before.get(expected.account); const post = after.get(expected.account);
      if ((!pre && !expected.allowCreated) || (!post && !expected.allowClosed) || (!pre && !post)) throw new Error("Missing account balance");
      for (const row of [pre, post]) if (row && (row.mint !== expected.mint || row.owner !== expected.owner)) throw new Error("Wrong recipient authority or mint");
      const signed = (post ? atomic(post.uiTokenAmount.amount) : 0n) - (pre ? atomic(pre.uiTokenAmount.amount) : 0n);
      const amount = expected.direction === "debit" ? -signed : signed;
      if (expected.direction === "unchanged" ? signed !== 0n : amount < min || amount > max) throw new Error("Delta outside authorization");
      return { account: expected.account, signedAtomic: signed.toString() };
    });
    // Catch other tenant token-account losses instead of checking only the happy-path output.
    const owners = new Set(input.expectedDeltas.map(delta => delta.owner));
    const expectedAccounts = new Set(input.expectedDeltas.map(delta => delta.account));
    for (const [key, pre] of before) {
      if (pre.owner && owners.has(pre.owner) && !expectedAccounts.has(key)) {
        const post = after.get(key);
        if (!post || post.owner !== pre.owner || post.mint !== pre.mint || atomic(post.uiTokenAmount.amount) < atomic(pre.uiTokenAmount.amount)) throw new Error("Unexpected token loss");
      }
    }
    return { status: "finalized", signature: input.signature, slot: transaction.slot, deltas };
  } catch { return { status: "failed", reason: "token-delta-or-recipient-mismatch" }; }
}
