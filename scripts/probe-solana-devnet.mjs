#!/usr/bin/env node

// Read-only discovery of KLend reserves using Circle's devnet test USDC.
// This does not select a reserve, build a transaction, or enable app writes.
import {
  decodeKaminoReserve,
  decodeClassicTokenAccount,
  decodeKaminoMarket,
  validateKaminoAccounts,
} from '../src/finance/solana/observations.ts';
import {
  deriveKaminoAddresses,
  SOLANA_DEVNET_MANIFEST,
  SOLANA_IDS,
} from '../src/finance/solana/manifest.ts';
import { setTimeout } from 'node:timers/promises';

if (process.argv.includes('--help')) {
  console.log('Usage: node --experimental-strip-types scripts/probe-solana-devnet.mjs');
  console.log(
    'Reads public Solana devnet accounts only; prints a JSON snapshot of reserve candidates.',
  );
  process.exit(0);
}
if (process.argv.length !== 2) throw new Error('Unexpected argument');

const rpcUrl = 'https://api.devnet.solana.com';
const loader = 'BPFLoaderUpgradeab1e11111111111111111111111';
async function rpc(method, params) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
    const body = await response.json();
    // Public RPC nodes can briefly trail the node that returned the listing.
    if (body.error?.code === -32016 && attempt < 5) {
      await setTimeout(500 * (attempt + 1));
      continue;
    }
    if (body.error || !('result' in body))
      throw new Error(`${method}: RPC error ${JSON.stringify(body.error)}`);
    return body.result;
  }
  throw new Error(`${method}: RPC did not reach the listing slot`);
}
function account(key, row) {
  if (!row || !Array.isArray(row.data) || row.data[1] !== 'base64')
    throw new Error(`Missing account: ${key}`);
  return {
    address: key,
    owner: row.owner,
    executable: row.executable,
    data: new Uint8Array(Buffer.from(row.data[0], 'base64')),
  };
}
function checkedMint(observed, expectedSupply) {
  if (
    observed.owner !== SOLANA_IDS.token ||
    observed.executable ||
    observed.data.length !== 82 ||
    observed.data[45] !== 1 ||
    observed.data[44] !== 6
  )
    throw new Error('Receipt mint is not an initialized classic SPL mint');
  const view = new DataView(
    observed.data.buffer,
    observed.data.byteOffset,
    observed.data.byteLength,
  );
  const supply = view.getBigUint64(36, true);
  // Some devnet reserves have a 100,000-atomic-unit difference between these
  // fields. Report it for review; the existing escrow values receipts using
  // the reserve's tracked supply, as KLend does, not the SPL mint's supply.
  return {
    decimals: observed.data[44],
    supplyAtomic: supply.toString(),
    differenceFromReserveAtomic: (BigInt(expectedSupply) - supply).toString(),
  };
}

const genesisHash = await rpc('getGenesisHash', []);
if (genesisHash !== SOLANA_DEVNET_MANIFEST.genesisHash)
  throw new Error('RPC is not the pinned Solana devnet');
const programRow = (
  await rpc('getAccountInfo', [SOLANA_IDS.klend, { encoding: 'base64', commitment: 'finalized' }])
).value;
const program = account(SOLANA_IDS.klend, programRow);
if (!program.executable || program.owner !== loader)
  throw new Error('KLend program is not the expected executable');
const depositMintRow = (
  await rpc('getAccountInfo', [
    SOLANA_DEVNET_MANIFEST.deposit.mint,
    { encoding: 'base64', commitment: 'finalized' },
  ])
).value;
const depositMint = account(SOLANA_DEVNET_MANIFEST.deposit.mint, depositMintRow);
if (
  depositMint.owner !== SOLANA_IDS.token ||
  depositMint.executable ||
  depositMint.data.length !== 82 ||
  depositMint.data[45] !== 1 ||
  depositMint.data[44] !== 6
)
  throw new Error('Test USDC mint is not an initialized six-decimal classic SPL mint');

const listing = await rpc('getProgramAccounts', [
  SOLANA_IDS.klend,
  {
    encoding: 'base64',
    withContext: true,
    commitment: 'finalized',
    filters: [
      { dataSize: 8624 },
      { memcmp: { offset: 128, bytes: SOLANA_DEVNET_MANIFEST.deposit.mint } },
    ],
  },
]);
if (!Array.isArray(listing.value) || listing.value.length > 200)
  throw new Error('Unexpected reserve listing');
const reserves = listing.value.map((row) => {
  const observed = account(row.pubkey, row.account);
  return { observed, decoded: decodeKaminoReserve(observed) };
});
const keys = [
  ...new Set(
    reserves.flatMap(({ decoded }) => [
      decoded.market,
      decoded.liquiditySupply,
      decoded.receiptMint,
      ...decoded.oracleAccounts,
    ]),
  ),
];
const observations = new Map();
let accountSlot = listing.context.slot;
for (let offset = 0; offset < keys.length; offset += 100) {
  const batch = keys.slice(offset, offset + 100);
  const result = await rpc('getMultipleAccounts', [
    batch,
    {
      encoding: 'base64',
      commitment: 'finalized',
      minContextSlot: listing.context.slot,
    },
  ]);
  accountSlot = Math.max(accountSlot, result.context.slot);
  for (let i = 0; i < batch.length; i++)
    if (result.value[i]) observations.set(batch[i], account(batch[i], result.value[i]));
}

const candidates = [];
for (const { observed, decoded: reserve } of reserves) {
  const item = {
    reserve: reserve.address,
    market: reserve.market,
    availableAtomic: reserve.availableAtomic,
    lastUpdateSlot: reserve.lastUpdateSlot,
    active: reserve.active,
    compatibleAccountState: false,
  };
  try {
    const market = observations.get(reserve.market);
    const vault = observations.get(reserve.liquiditySupply);
    const receiptMint = observations.get(reserve.receiptMint);
    if (
      !market ||
      !vault ||
      !receiptMint ||
      reserve.oracleAccounts.some((key) => !observations.has(key))
    )
      throw new Error('Market, vault, receipt mint or oracle account is missing');
    const derived = await deriveKaminoAddresses(reserve.address, reserve.market);
    const manifest = {
      cluster: 'devnet',
      genesisHash,
      escrowProgram: SOLANA_IDS.system,
      programSha256: '0'.repeat(64),
      depositMint: SOLANA_DEVNET_MANIFEST.deposit.mint,
      market: reserve.market,
      reserve: reserve.address,
      receiptMint: reserve.receiptMint,
      liquiditySupply: reserve.liquiditySupply,
      marketAuthority: derived.marketAuthority,
      oracleAccounts: reserve.oracleAccounts,
      maxObservationAgeMs: 60_000,
    };
    const result = await validateKaminoAccounts({
      manifest,
      context: { genesisHash, slot: String(accountSlot), observedAtMs: Date.now() },
      nowMs: Date.now(),
      reserve: observed,
      market,
      liquiditySupply: vault,
      program,
      trackedReceiptAtomic: '0',
    });
    const decodedMarket = decodeKaminoMarket(market);
    const decodedVault = decodeClassicTokenAccount(vault);
    const mint = checkedMint(receiptMint, reserve.collateralSupplyAtomic);
    Object.assign(item, {
      compatibleAccountState: true,
      liquiditySupply: reserve.liquiditySupply,
      receiptMint: reserve.receiptMint,
      marketAuthority: derived.marketAuthority,
      oracleAccounts: reserve.oracleAccounts,
      availableLiquidityAtomic: result.availableLiquidityAtomic,
      marketEmergency: decodedMarket.emergency,
      vaultAtomic: decodedVault.amountAtomic,
      receiptMintDecimals: mint.decimals,
      receiptMintSupplyAtomic: mint.supplyAtomic,
      receiptSupplyDifferenceAtomic: mint.differenceFromReserveAtomic,
      requiresRefresh: result.requiresRefresh,
    });
  } catch (error) {
    item.reason = error instanceof Error ? error.message : String(error);
  }
  candidates.push(item);
}
candidates.sort((a, b) => {
  const left = BigInt(a.availableAtomic),
    right = BigInt(b.availableAtomic);
  return left === right ? 0 : left > right ? -1 : 1;
});
console.log(
  JSON.stringify(
    {
      observedAt: new Date().toISOString(),
      rpcUrl,
      genesisHash,
      listingSlot: listing.context.slot,
      accountSlot,
      depositMint: SOLANA_DEVNET_MANIFEST.deposit.mint,
      accountStateOnly: true,
      caveat:
        'No refresh, deposit, redemption, yield, issuer route or escrow deployment was executed.',
      candidates,
    },
    null,
    2,
  ),
);
