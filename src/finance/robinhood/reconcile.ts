import { decodeEventLog, type Hex, type PublicClient } from 'viem';
import { rentalEscrowAbi } from './abi.ts';
import { sameAddress } from './manifest.ts';
import type { EscrowCallPlan } from './plan.ts';

export type EscrowReconciliation =
  | {
      status: 'pending' | 'unavailable' | 'unverified' | 'reverted';
      transactionHash: Hex;
      reason: string;
    }
  | {
      status: 'confirming' | 'completed';
      transactionHash: Hex;
      blockNumber: string;
      blockHash: Hex;
      confirmations: string;
      eventName: string;
      operationNonce: string;
      amounts: Record<string, string>;
    };

/** Read-only reconciliation. A timeout or unknown transaction never authorizes a retry. */
export async function reconcileReceipt(
  client: PublicClient,
  plan: EscrowCallPlan,
  hash: Hex,
  requiredConfirmations = 3n,
): Promise<EscrowReconciliation> {
  if (requiredConfirmations < 1n) throw new Error('Positive confirmation threshold required');
  try {
    if ((await client.getChainId()) !== plan.chainId)
      return { status: 'unverified', transactionHash: hash, reason: 'RPC chain mismatch' };
    const receipt = await client.getTransactionReceipt({ hash });
    if (receipt.status !== 'success')
      return { status: 'reverted', transactionHash: hash, reason: 'Native transaction reverted' };
    const tx = await client.getTransaction({ hash });
    if (
      !tx.to ||
      !sameAddress(tx.to, plan.to) ||
      (!plan.relayAuthorization && !sameAddress(tx.from, plan.requiredSigner)) ||
      tx.input.toLowerCase() !== plan.data.toLowerCase() ||
      tx.value !== 0n
    )
      return {
        status: 'unverified',
        transactionHash: hash,
        reason:
          'Receipt does not prove the exact native call; smart-account envelopes need separate verification',
      };
    const [canonical, head] = await Promise.all([
      client.getBlock({ blockNumber: receipt.blockNumber }),
      client.getBlockNumber(),
    ]);
    if (canonical.hash !== receipt.blockHash)
      return {
        status: 'pending',
        transactionHash: hash,
        reason: 'Receipt block is no longer canonical',
      };
    if (
      plan.relayAuthorization &&
      !receipt.logs.some((log) => {
        if (!sameAddress(log.address, plan.to)) return false;
        try {
          const decoded = decodeEventLog({
            abi: rentalEscrowAbi,
            data: log.data,
            topics: log.topics,
          });
          return (
            decoded.eventName === 'SignedOperationExecuted' &&
            sameAddress(decoded.args.signer, plan.relayAuthorization!.signer) &&
            decoded.args.digest === plan.relayAuthorization!.digest &&
            decoded.args.operationNonce.toString() === plan.expectedNonce
          );
        } catch {
          return false;
        }
      })
    )
      return {
        status: 'unverified',
        transactionHash: hash,
        reason: 'Signed operation authorization event is missing',
      };
    for (const log of receipt.logs) {
      if (!sameAddress(log.address, plan.to)) continue;
      try {
        const decoded = decodeEventLog({
          abi: rentalEscrowAbi,
          data: log.data,
          topics: log.topics,
        });
        if (
          decoded.eventName !== plan.expectedEvent ||
          decoded.args.operationNonce.toString() !== plan.expectedNonce
        )
          continue;
        const amounts = Object.fromEntries(
          Object.entries(decoded.args)
            .filter(([key, value]) => key !== 'operationNonce' && typeof value === 'bigint')
            .map(([key, value]) => [key, String(value)]),
        );
        const confirmations = head >= receipt.blockNumber ? head - receipt.blockNumber + 1n : 0n;
        return {
          status: confirmations >= requiredConfirmations ? 'completed' : 'confirming',
          transactionHash: hash,
          blockNumber: receipt.blockNumber.toString(),
          blockHash: receipt.blockHash,
          confirmations: confirmations.toString(),
          eventName: decoded.eventName,
          operationNonce: plan.expectedNonce,
          amounts,
        };
      } catch {
        /* Ignore unrelated logs, never substitute transaction success for an escrow event. */
      }
    }
    return {
      status: 'unverified',
      transactionHash: hash,
      reason: 'Expected escrow event and nonce were not found',
    };
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    return {
      status:
        name === 'TransactionReceiptNotFoundError' || name === 'TransactionNotFoundError'
          ? 'pending'
          : 'unavailable',
      transactionHash: hash,
      reason: name.includes('NotFound')
        ? 'Transaction has not been observed'
        : 'RPC observation failed; retain submitted state',
    };
  }
}
