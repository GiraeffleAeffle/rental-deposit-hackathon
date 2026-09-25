import { isAddress, zeroAddress, zeroHash } from 'viem';
import type { RentalWallet, SigningReview } from './types.ts';

export interface EscrowAction {
  signer: `0x${string}`;
  kind: number;
  amount: string;
  limit: string;
  evidence: `0x${string}`;
  expectedNonce: string;
  deadline: string;
}

export interface EscrowSigningRequest extends SigningReview {
  walletId: string;
  chainId: 4663 | 46630;
  escrowAddress: `0x${string}`;
  action: EscrowAction;
}

const escrowActionTypes = {
  EscrowAction: [
    { name: 'signer', type: 'address' },
    { name: 'kind', type: 'uint8' },
    { name: 'amount', type: 'uint256' },
    { name: 'limit', type: 'uint256' },
    { name: 'evidence', type: 'bytes32' },
    { name: 'expectedNonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

/** Produces only the escrow's bounded action schema, never arbitrary typed data. */
export function prepareEscrowTypedData(
  request: EscrowSigningRequest,
  wallet: RentalWallet | undefined,
  now = Date.now(),
) {
  if (
    !wallet ||
    !wallet.connected ||
    wallet.id !== request.walletId ||
    wallet.chainType !== 'ethereum'
  ) {
    throw new Error('Your selected wallet is not available.');
  }
  if (request.chainId !== 4663 && request.chainId !== 46630)
    throw new Error('Unsupported escrow chain.');
  if (!isAddress(request.escrowAddress) || request.escrowAddress === zeroAddress)
    throw new Error('Invalid escrow address.');
  const action = request.action;
  if (!isAddress(action.signer) || action.signer.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error('The action was prepared for another signer.');
  }
  if (!Number.isInteger(action.kind) || action.kind < 0 || action.kind > 8)
    throw new Error('Unsupported escrow action.');
  for (const value of [action.amount, action.limit, action.expectedNonce, action.deadline]) {
    if (!/^(0|[1-9][0-9]*)$/.test(value) || BigInt(value) > (1n << 256n) - 1n)
      throw new Error('Invalid escrow action amount.');
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(action.evidence)) throw new Error('Invalid evidence commitment.');
  if (action.kind !== 4 && action.evidence !== zeroHash)
    throw new Error('Unexpected evidence commitment.');
  if ([0, 1, 5, 6, 8].includes(action.kind) && action.amount !== '0')
    throw new Error('Unexpected action amount.');
  if ([0, 1, 4, 6].includes(action.kind) && action.limit !== '0')
    throw new Error('Unexpected action limit.');
  const expiry = Date.parse(request.expiresAt);
  if (
    !request.operationId.trim() ||
    !request.description.trim() ||
    !Number.isFinite(expiry) ||
    expiry <= now ||
    BigInt(action.deadline) * 1000n <= BigInt(now) ||
    BigInt(action.deadline) * 1000n > BigInt(expiry)
  )
    throw new Error('Refresh the escrow request before signing.');
  return {
    domain: {
      name: 'RentalEscrow',
      version: '1',
      chainId: request.chainId,
      verifyingContract: request.escrowAddress,
    },
    primaryType: 'EscrowAction' as const,
    types: { EscrowAction: escrowActionTypes.EscrowAction.map((field) => ({ ...field })) },
    message: {
      signer: action.signer,
      kind: action.kind,
      amount: action.amount,
      limit: action.limit,
      evidence: action.evidence,
      expectedNonce: action.expectedNonce,
      deadline: action.deadline,
    },
  };
}
