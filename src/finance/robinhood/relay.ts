import { encodeFunctionData, hashTypedData, type Address, type Hex } from 'viem';
import { rentalEscrowAbi } from './abi.ts';
import { atomic, type RobinhoodManifest } from './manifest.ts';
import { planEscrowCall, type EscrowCallPlan, type EscrowIntent } from './plan.ts';
import type { EscrowSnapshot } from './read.ts';

export const escrowActionTypes = {
  EscrowAction: [
    { name: 'signer', type: 'address' },
    { name: 'kind', type: 'uint8' },
    { name: 'amount', type: 'uint256' },
    { name: 'limit', type: 'uint256' },
    { name: 'evidence', type: 'bytes32' },
    { name: 'expectedNonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;
const kinds = {
  acceptAgreement: 0,
  fund: 1,
  supply: 2,
  releaseEarnings: 3,
  proposeClaim: 4,
  acceptClaim: 5,
  contestClaim: 6,
  resolveClaim: 7,
  settle: 8,
} as const;
const zeroHash = `0x${'0'.repeat(64)}` as Hex;

export function prepareSignedOperation(
  manifest: RobinhoodManifest,
  snapshot: EscrowSnapshot,
  intent: EscrowIntent,
  signer: Address,
  deadline: string,
  now?: bigint,
) {
  const nativePlan = planEscrowCall(manifest, snapshot, intent, signer, deadline, now);
  const amount =
    'assets' in intent
      ? atomic(intent.assets)
      : 'landlordAssets' in intent
        ? atomic(intent.landlordAssets)
        : 0n;
  const limit =
    'minShares' in intent
      ? atomic(intent.minShares)
      : 'maxSharesBurned' in intent
        ? atomic(intent.maxSharesBurned)
        : 'minimumAssets' in intent
          ? atomic(intent.minimumAssets)
          : 'minRedeemedAssets' in intent
            ? atomic(intent.minRedeemedAssets)
            : 0n;
  const action = {
    signer: nativePlan.requiredSigner,
    kind: kinds[intent.kind],
    amount,
    limit,
    evidence: 'evidenceHash' in intent ? intent.evidenceHash : zeroHash,
    expectedNonce: atomic(snapshot.nonce),
    deadline: atomic(deadline),
  };
  const typedData = {
    domain: {
      name: 'RentalEscrow',
      version: '1',
      chainId: manifest.chainId,
      verifyingContract: snapshot.address,
    },
    types: escrowActionTypes,
    primaryType: 'EscrowAction' as const,
    message: action,
  };
  return { nativePlan, action, typedData, digest: hashTypedData(typedData) };
}

/** The relayer receives only this bounded, signed action. EOA/ERC1271 validity is enforced on-chain. */
export function encodeSignedOperation(
  prepared: ReturnType<typeof prepareSignedOperation>,
  signature: Hex,
): EscrowCallPlan {
  return {
    ...prepared.nativePlan,
    data: encodeFunctionData({
      abi: rentalEscrowAbi,
      functionName: 'executeSigned',
      args: [prepared.action, signature],
    }),
    relayAuthorization: { signer: prepared.action.signer, digest: prepared.digest },
  };
}
