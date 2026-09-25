export type Network = 'robinhood' | 'solana';
export type Role = 'tenant' | 'landlord' | 'arbitrator';

export const networks = {
  robinhood: {
    name: 'Robinhood Chain',
    currency: 'USDG',
    investmentDecimals: 18,
    lending: 'Morpho',
    investment: 'Stock Tokens',
  },
  solana: {
    name: 'Solana',
    currency: 'USDC',
    investmentDecimals: 8,
    lending: 'Kamino',
    investment: 'xStocks',
  },
} as const;

export function isNetwork(value: unknown): value is Network {
  return value === 'robinhood' || value === 'solana';
}

export function atomic(value: string): bigint {
  if (!/^(0|[1-9]\d{0,37})$/.test(value))
    throw new Error('Use a non-negative integer amount in atomic units.');
  return BigInt(value);
}

export function parseAmount(value: string, decimals = 6): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18)
    throw new Error('Unsupported asset precision.');
  if (!/^(0|[1-9]\d{0,18})(\.\d+)?$/.test(value))
    throw new Error('Enter a positive decimal amount.');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals)
    throw new Error(`This asset supports ${decimals} decimal places.`);
  return (
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, '0') || '0')
  ).toString();
}

export function displayAmount(value: string, decimals = 6, places = 2): string {
  const amount = atomic(value);
  const scale = 10n ** BigInt(decimals);
  const whole = (amount / scale).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return places
    ? `${whole}.${(amount % scale).toString().padStart(decimals, '0').slice(0, places).padEnd(places, '0')}`
    : whole;
}

export const minimum = (...values: bigint[]) =>
  values.reduce((smallest, value) => (value < smallest ? value : smallest));
export const positiveDifference = (left: bigint, right: bigint) =>
  left > right ? left - right : 0n;
