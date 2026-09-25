import {
  encodeFunctionData,
  getAddress,
  isHex,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';
import { rentalEscrowAbi, erc20Abi } from './abi.ts';
import { atomic, sameAddress, validateManifest, type RobinhoodManifest } from './manifest.ts';
import type { EscrowSnapshot } from './read.ts';

export type EscrowIntent =
  | { kind: 'acceptAgreement' | 'fund' | 'contestClaim' }
  | { kind: 'supply'; assets: string; minShares: string }
  | { kind: 'releaseEarnings'; assets: string; maxSharesBurned: string }
  | { kind: 'proposeClaim'; assets: string; evidenceHash: Hex }
  | { kind: 'acceptClaim'; minimumAssets: string }
  | { kind: 'resolveClaim'; landlordAssets: string; minimumAssets: string }
  | { kind: 'settle'; minRedeemedAssets: string };

export interface EscrowCallPlan {
  network: 'robinhood';
  chainId: number;
  to: Address;
  data: Hex;
  value: '0';
  requiredSigner: Address;
  expectedNonce: string;
  deadline: string;
  kind: EscrowIntent['kind'];
  expectedEvent: string;
  evidence: 'prepared-native-call';
  relayAuthorization?: { signer: Address; digest: Hex };
}

const events = {
  acceptAgreement: 'AgreementAccepted',
  fund: 'Funded',
  supply: 'Supplied',
  releaseEarnings: 'EarningsReleased',
  proposeClaim: 'ClaimProposed',
  acceptClaim: 'SettlementApproved',
  contestClaim: 'ClaimContested',
  resolveClaim: 'SettlementApproved',
  settle: 'Settled',
} as const;

export function planEscrowCall(
  manifest: RobinhoodManifest,
  snapshot: EscrowSnapshot,
  intent: EscrowIntent,
  signer: Address,
  deadline: string,
  nowSeconds: bigint = BigInt(Math.floor(Date.now() / 1000)),
): EscrowCallPlan {
  validateManifest(manifest);
  if (
    snapshot.chainId !== manifest.chainId ||
    !sameAddress(snapshot.asset, manifest.asset.address) ||
    !sameAddress(snapshot.vault, manifest.vault)
  )
    throw new Error('Snapshot does not match the tenancy network');
  if (
    nowSeconds - atomic(snapshot.observedAt) > 60n ||
    atomic(snapshot.observedAt) > nowSeconds + 10n
  )
    throw new Error('Refresh the escrow observation before planning');
  const expiry = atomic(deadline);
  if (expiry <= nowSeconds || expiry > nowSeconds + 900n)
    throw new Error('Authorization expires within 15 minutes');
  const required =
    intent.kind === 'acceptAgreement'
      ? [snapshot.tenant, snapshot.landlord]
      : intent.kind === 'proposeClaim'
        ? [snapshot.landlord]
        : intent.kind === 'resolveClaim'
          ? [snapshot.arbitrator]
          : intent.kind === 'settle'
            ? [signer]
            : [snapshot.tenant];
  if (!required.some((account) => sameAddress(account, signer)))
    throw new Error('Signer is not authorized for this action');
  const n = atomic(snapshot.nonce);
  const tail = [n, expiry] as const;
  let data: Hex;
  switch (intent.kind) {
    case 'acceptAgreement':
    case 'fund':
    case 'contestClaim':
      data = encodeFunctionData({ abi: rentalEscrowAbi, functionName: intent.kind, args: tail });
      break;
    case 'supply':
      if (atomic(intent.assets) === 0n || atomic(intent.minShares) === 0n)
        throw new Error('Positive assets and minimum shares required');
      data = encodeFunctionData({
        abi: rentalEscrowAbi,
        functionName: intent.kind,
        args: [atomic(intent.assets), atomic(intent.minShares), ...tail],
      });
      break;
    case 'releaseEarnings':
      if (
        !snapshot.earningsReleaseAllowed ||
        atomic(intent.assets) === 0n ||
        atomic(intent.assets) > atomic(snapshot.releasableEarnings)
      )
        throw new Error('Amount exceeds policy-permitted earnings');
      data = encodeFunctionData({
        abi: rentalEscrowAbi,
        functionName: intent.kind,
        args: [atomic(intent.assets), atomic(intent.maxSharesBurned), ...tail],
      });
      break;
    case 'proposeClaim':
      if (
        atomic(intent.assets) > atomic(snapshot.securityRequirement) ||
        !isHex(intent.evidenceHash) ||
        intent.evidenceHash.length !== 66
      )
        throw new Error('Invalid claim amount or evidence digest');
      data = encodeFunctionData({
        abi: rentalEscrowAbi,
        functionName: intent.kind,
        args: [atomic(intent.assets), intent.evidenceHash, ...tail],
      });
      break;
    case 'acceptClaim':
      data = encodeFunctionData({
        abi: rentalEscrowAbi,
        functionName: intent.kind,
        args: [atomic(intent.minimumAssets), ...tail],
      });
      break;
    case 'resolveClaim':
      if (atomic(intent.landlordAssets) > atomic(snapshot.claimAmount))
        throw new Error('Award exceeds the requested claim');
      data = encodeFunctionData({
        abi: rentalEscrowAbi,
        functionName: intent.kind,
        args: [atomic(intent.landlordAssets), atomic(intent.minimumAssets), ...tail],
      });
      break;
    case 'settle':
      data = encodeFunctionData({
        abi: rentalEscrowAbi,
        functionName: intent.kind,
        args: [atomic(intent.minRedeemedAssets), ...tail],
      });
      break;
  }
  return {
    network: 'robinhood',
    chainId: manifest.chainId,
    to: getAddress(snapshot.address),
    data,
    value: '0',
    requiredSigner: getAddress(signer),
    expectedNonce: snapshot.nonce,
    deadline,
    kind: intent.kind,
    expectedEvent: events[intent.kind],
    evidence: 'prepared-native-call',
  };
}

/** Mandatory immediately before requesting a native signature; errors never become synthetic success. */
export async function simulateEscrowCall(
  client: PublicClient,
  plan: EscrowCallPlan,
): Promise<void> {
  if ((await client.getChainId()) !== plan.chainId) throw new Error('RPC chain mismatch');
  await client.call({ account: plan.requiredSigner, to: plan.to, data: plan.data, value: 0n });
}

export function planFundingApproval(manifest: RobinhoodManifest, escrow: Address, amount: string) {
  validateManifest(manifest);
  return {
    chainId: manifest.chainId,
    to: manifest.asset.address,
    value: '0' as const,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [getAddress(escrow), atomic(amount)],
    }),
  };
}
