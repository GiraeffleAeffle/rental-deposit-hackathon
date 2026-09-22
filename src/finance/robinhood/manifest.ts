import { getAddress, type Address } from 'viem';

export interface RobinhoodManifest {
  network: 'robinhood';
  chainId: number;
  environment: 'mainnet' | 'testnet' | 'local-fork' | 'local-fixture';
  rpcUrl: string;
  asset: { address: Address; decimals: 6; symbol: string };
  vault: Address;
  vaultShareDecimals: 18;
  stock: Address | null;
  sourceBlock: string | null;
}

/** Dependency observations only. No application escrow is deployed by this manifest. */
export const robinhoodMainnet: RobinhoodManifest = {
  network: 'robinhood',
  chainId: 4663,
  environment: 'mainnet',
  rpcUrl: 'https://rpc.mainnet.chain.robinhood.com',
  asset: {
    address: getAddress('0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168'),
    decimals: 6,
    symbol: 'USDG',
  },
  vault: getAddress('0xBeEff033F34C046626B8D0A041844C5d1A5409dd'),
  vaultShareDecimals: 18,
  stock: getAddress('0x117cc2133c37B721F49dE2A7a74833232B3B4C0C'),
  sourceBlock: '69695660',
};

export function atomic(value: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value))
    throw new Error('Amount must be an unsigned atomic integer string');
  const parsed = BigInt(value);
  if (parsed >= 1n << 256n) throw new Error('Amount exceeds uint256');
  return parsed;
}

export function sameAddress(a: string, b: string): boolean {
  return getAddress(a) === getAddress(b);
}

export function validateManifest(manifest: RobinhoodManifest): void {
  if (
    !Number.isSafeInteger(manifest.chainId) ||
    manifest.chainId <= 0 ||
    manifest.asset.decimals !== 6
  )
    throw new Error('Invalid Robinhood network or denomination');
  getAddress(manifest.asset.address);
  getAddress(manifest.vault);
  if (
    manifest.environment === 'mainnet' &&
    (manifest.chainId !== 4663 ||
      !sameAddress(manifest.asset.address, robinhoodMainnet.asset.address) ||
      !sameAddress(manifest.vault, robinhoodMainnet.vault))
  )
    throw new Error('Mainnet dependency differs from the reviewed manifest');
}
