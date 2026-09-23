#!/usr/bin/env node

// Explicit, operator-only test-token rehearsal. No Privy or app agreement is implied.
import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  address,
  appendTransactionMessageInstruction,
  blockhash,
  compileTransaction,
  createKeyPairSignerFromBytes,
  createTransactionMessage,
  getBase58Decoder,
  getTransactionEncoder,
  partiallySignTransaction,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/kit';
import {
  buildEscrowInstruction,
  buildInitializeEscrow,
  decodeTenancy,
  deriveEscrowAddresses,
} from '../src/finance/solana/program.ts';
import {
  decodeClassicTokenAccount,
  validateKaminoAccounts,
} from '../src/finance/solana/observations.ts';
import { SOLANA_DEVNET_MANIFEST, SOLANA_IDS } from '../src/finance/solana/manifest.ts';
import { verifyDeployedProgram } from '../src/server/solana-rpc.ts';

const action = process.argv[2];
const send = process.argv[3] === '--send';
if (!['initialize', 'fund', 'supply', 'redeem', 'propose_no_claim', 'accept_no_claim', 'settle', 'status'].includes(action) ||
    process.argv.length !== (send ? 4 : 3) || (action === 'status' && send)) {
  console.error('Usage: node --experimental-strip-types scripts/rehearse-solana-devnet.mjs initialize|fund|supply|redeem|propose_no_claim|accept_no_claim|settle [--send]');
  console.error('       node --experimental-strip-types scripts/rehearse-solana-devnet.mjs status');
  process.exit(2);
}

const rpcUrl = 'https://api.devnet.solana.com';
const evidence = JSON.parse(await readFile(new URL('../docs/evidence/SOLANA_DEVNET_DEPLOYMENT_2026-09-23.json', import.meta.url), 'utf8'));
const keyDir = resolve(process.env.SOLANA_TEST_KEYS_DIR ?? '.testnet-secrets/solana');
const statePath = join(keyDir, 'operator-rehearsal.json');
const pendingPath = join(keyDir, 'operator-rehearsal-pending.json');
const manifest = {
  cluster: 'devnet', genesisHash: evidence.genesisHash,
  escrowProgram: evidence.escrowProgram, programSha256: evidence.programSha256,
  depositMint: evidence.depositMint, reserve: evidence.reserve, market: evidence.market,
  receiptMint: evidence.receiptMint, liquiditySupply: evidence.liquiditySupply,
  marketAuthority: evidence.marketAuthority, oracleAccounts: evidence.oracleAccounts,
  maxObservationAgeMs: 60_000,
};
if (manifest.genesisHash !== SOLANA_DEVNET_MANIFEST.genesisHash ||
    manifest.depositMint !== SOLANA_DEVNET_MANIFEST.deposit.mint || !evidence.operatorOnly) {
  throw new Error('This script is restricted to the pinned operator devnet rehearsal');
}

async function rpc(method, params = []) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status === 429 || response.status >= 500) throw new Error(`HTTP ${response.status}`);
      if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
      const body = await response.json();
      if (body.error) {
        if (body.error.code === -32016) throw new Error('RPC node is behind the observed slot');
        throw new Error(`${method}: ${JSON.stringify(body.error)}`);
      }
      if (!('result' in body)) throw new Error(`${method}: no result`);
      return body.result;
    } catch (error) {
      if (attempt === 4 || /: HTTP 4\d\d|InstructionError/.test(String(error))) throw error;
      await delay(350 * (attempt + 1));
    }
  }
  throw new Error(`${method}: retries exhausted`);
}
function observation(key, row) {
  if (!row || !Array.isArray(row.data) || row.data[1] !== 'base64') return null;
  return {
    address: key, owner: row.owner, executable: row.executable,
    data: new Uint8Array(Buffer.from(row.data[0], 'base64')),
  };
}
async function multiple(keys) {
  const result = await rpc('getMultipleAccounts', [keys, { encoding: 'base64', commitment: 'finalized' }]);
  if (!Array.isArray(result.value) || result.value.length !== keys.length) throw new Error('Incomplete account observation');
  return { slot: result.context.slot, rows: keys.map((key, i) => observation(key, result.value[i])) };
}
async function signer(name, expected) {
  const raw = JSON.parse(await readFile(join(keyDir, `${name}-keypair.json`), 'utf8'));
  if (!Array.isArray(raw) || raw.length !== 64 || raw.some(x => !Number.isInteger(x) || x < 0 || x > 255))
    throw new Error(`Invalid ${name} test key`);
  const value = await createKeyPairSignerFromBytes(new Uint8Array(raw));
  if (value.address !== expected) throw new Error(`${name} key differs from the public test address`);
  return value;
}
async function localState() {
  try { return JSON.parse(await readFile(statePath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (action !== 'initialize') throw new Error('Initialize the operator tenancy first');
  const leaseIdHex = randomBytes(32).toString('hex');
  const policyHashHex = createHash('sha256').update(`operator-devnet-only:${leaseIdHex}`).digest('hex');
  const value = { leaseIdHex, policyHashHex, history: [] };
  await writeFile(statePath, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  return value;
}
async function finalizedSignature(signature) {
  const result = await rpc('getSignatureStatuses', [[signature], { searchTransactionHistory: true }]);
  const item = result.value?.[0];
  if (!item) return null;
  if (item.err) throw new Error(`Transaction ${signature} failed: ${JSON.stringify(item.err)}`);
  return item.confirmationStatus === 'finalized' ? item : null;
}
const genesis = await rpc('getGenesisHash');
if (genesis !== manifest.genesisHash) throw new Error('RPC is not the pinned Solana devnet');
let state = await localState();
let pending;
try { pending = JSON.parse(await readFile(pendingPath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (pending) {
  const receipt = await finalizedSignature(pending.signature);
  if (!receipt) {
    console.log(JSON.stringify({ status: 'pending-or-unknown', action: pending.action, signature: pending.signature }));
    process.exit(action === 'status' ? 0 : 1);
  }
  state.history.push({ action: pending.action, signature: pending.signature, slot: receipt.slot });
  await writeFile(statePath, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  await unlink(pendingPath);
}
if (action === 'status') {
  console.log(JSON.stringify({ status: 'clear', history: state.history }));
  process.exit(0);
}

const [payer, tenant, landlord] = await Promise.all([
  signer('deployer', evidence.upgradeAuthority), signer('tenant', evidence.tenant),
  signer('landlord', evidence.landlord),
]);
const leaseId = Buffer.from(state.leaseIdHex, 'hex');
const derived = await deriveEscrowAddresses(manifest.escrowProgram, tenant.address, leaseId);
const keys = [evidence.escrowProgram, evidence.programData, SOLANA_IDS.klend,
  evidence.reserve, evidence.market, evidence.liquiditySupply, evidence.depositMint,
  evidence.receiptMint, ...evidence.oracleAccounts,
  evidence.tenantUsdcAccount, evidence.landlordUsdcAccount, derived.tenancy];
const observed = await multiple(keys);
const byKey = new Map(keys.map((key, i) => [key, observed.rows[i]]));
verifyDeployedProgram({ ...manifest, programCodeLength: evidence.programCodeLength, upgradeAuthority: evidence.upgradeAuthority },
  byKey.get(evidence.escrowProgram), byKey.get(evidence.programData));
const candidate = await validateKaminoAccounts({
  manifest, context: { genesisHash: genesis, slot: String(observed.slot), observedAtMs: Date.now() },
  nowMs: Date.now(), reserve: byKey.get(evidence.reserve), market: byKey.get(evidence.market),
  liquiditySupply: byKey.get(evidence.liquiditySupply), program: byKey.get(SOLANA_IDS.klend),
  trackedReceiptAtomic: '0',
});
for (const [key, owner] of [[evidence.tenantUsdcAccount, tenant.address], [evidence.landlordUsdcAccount, landlord.address]]) {
  const token = decodeClassicTokenAccount(byKey.get(key));
  if (token.mint !== evidence.depositMint || token.authority !== owner || !token.initialized || token.frozen)
    throw new Error('A fixed payout token account differs from the recorded party');
}
const before = byKey.get(derived.tenancy);
if (action === 'initialize' && before) throw new Error('This operator tenancy is already initialized');
if (action !== 'initialize' && !before) throw new Error('Operator tenancy is not initialized');
const tenancy = before ? decodeTenancy(before, manifest) : null;
if (tenancy && (tenancy.tenant !== tenant.address || tenancy.landlord !== landlord.address ||
    tenancy.arbitrator !== evidence.arbitrator || tenancy.tenantDestination !== evidence.tenantUsdcAccount ||
    tenancy.landlordDestination !== evidence.landlordUsdcAccount ||
    Buffer.from(tenancy.policyHash).toString('hex') !== state.policyHashHex)) {
  throw new Error('Operator tenancy differs from the recorded test policy or parties');
}
let ix;
let actor = tenant;
if (action === 'initialize') {
  ix = await buildInitializeEscrow({
    manifest, payer: payer.address, tenant: tenant.address, landlord: landlord.address,
    arbitrator: evidence.arbitrator, leaseId, policyHash: Buffer.from(state.policyHashHex, 'hex'),
    releasePermitted: true, requiredSecurityAtomic: '10000000',
    tenantDestination: evidence.tenantUsdcAccount, landlordDestination: evidence.landlordUsdcAccount,
  });
} else {
  if (action === 'propose_no_claim') actor = landlord;
  if (action === 'accept_no_claim' && tenancy.claimAtomic !== '0')
    throw new Error('This command can only accept a zero-amount claim');
  if (action === 'settle' && (tenancy.claimAtomic !== '0' || tenancy.approvedClaimAtomic !== '0'))
    throw new Error('This command can only settle a no-claim tenancy');
  const planned = action === 'fund' ? { kind: 'fund', source: evidence.tenantUsdcAccount }
    : action === 'supply' ? { kind: 'supply', amountAtomic: '10000000' }
    : action === 'redeem' ? { kind: 'redeem', receiptAtomic: tenancy.accountedReceiptsAtomic, minimumReceivedAtomic: '9900000' }
    : action === 'propose_no_claim' ? { kind: 'propose_claim', amountAtomic: '0' }
    : action === 'accept_no_claim' ? { kind: 'respond_to_claim', accept: true }
    : { kind: 'settle' };
  ix = await buildEscrowInstruction({ manifest, tenancy, actor: actor.address,
    nonce: tenancy.nextNonce, action: planned });
}
const latest = await rpc('getLatestBlockhash', [{ commitment: 'finalized' }]);
const compute = new Uint8Array(5);
compute[0] = 2;
new DataView(compute.buffer).setUint32(1, action === 'initialize' ? 600_000 : 800_000, true);
let message = setTransactionMessageLifetimeUsingBlockhash(
  { blockhash: blockhash(latest.value.blockhash), lastValidBlockHeight: BigInt(latest.value.lastValidBlockHeight) },
  setTransactionMessageFeePayer(address(payer.address), createTransactionMessage({ version: 0 })),
);
message = appendTransactionMessageInstruction({
  programAddress: address('ComputeBudget111111111111111111111111111111'), data: compute,
}, message);
message = appendTransactionMessageInstruction(ix, message);
const unsigned = compileTransaction(message);
const signed = await partiallySignTransaction(
  action === 'initialize' ? [payer.keyPair, tenant.keyPair, landlord.keyPair] : [payer.keyPair, actor.keyPair],
  unsigned,
);
const signature = getBase58Decoder().decode(signed.signatures[address(payer.address)]);
const bytes = Buffer.from(getTransactionEncoder().encode(signed));
if (bytes.length > 1232) throw new Error(`Transaction too large: ${bytes.length} bytes`);
const simulated = await rpc('simulateTransaction', [bytes.toString('base64'), {
  encoding: 'base64', sigVerify: true, commitment: 'finalized', replaceRecentBlockhash: false,
}]);
if (simulated.value.err) {
  console.error(JSON.stringify({ status: 'simulation-failed', action, err: simulated.value.err,
    logs: simulated.value.logs?.slice(-24) }));
  process.exit(1);
}
const report = { status: send ? 'ready-to-send' : 'simulation-passed', action,
  tenancy: derived.tenancy, tenant: tenant.address, landlord: landlord.address,
  amountAtomic: action === 'initialize' || action === 'fund' || action === 'supply' ? '10000000' : undefined,
  reserve: candidate.reserve.address, transactionBytes: bytes.length,
  unitsConsumed: simulated.value.unitsConsumed, signature };
console.log(JSON.stringify(report));
if (!send) process.exit(0);
await writeFile(pendingPath, JSON.stringify({ action, signature, bytesBase64: bytes.toString('base64'),
  lastValidBlockHeight: latest.value.lastValidBlockHeight }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
const returned = await rpc('sendTransaction', [bytes.toString('base64'), {
  encoding: 'base64', skipPreflight: false, preflightCommitment: 'finalized', maxRetries: 0,
}]);
if (returned !== signature) throw new Error('RPC returned a different transaction signature');
for (let attempt = 0; attempt < 40; attempt++) {
  const receipt = await finalizedSignature(signature);
  if (receipt) {
    state.history.push({ action, signature, slot: receipt.slot });
    await writeFile(statePath, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
    await unlink(pendingPath);
    const result = await multiple([derived.tenancy, derived.cash, derived.receipts, evidence.tenantUsdcAccount, evidence.landlordUsdcAccount]);
    const t = decodeTenancy(result.rows[0], manifest);
    console.log(JSON.stringify({ status: 'finalized', action, signature, slot: receipt.slot,
      tenancy: t.address, phase: t.phase, nextNonce: t.nextNonce,
      idleAtomic: t.accountedIdleAtomic, receiptsAtomic: t.accountedReceiptsAtomic,
      tenantUsdcAtomic: decodeClassicTokenAccount(result.rows[3]).amountAtomic,
      landlordUsdcAtomic: decodeClassicTokenAccount(result.rows[4]).amountAtomic }));
    process.exit(0);
  }
  await delay(1_500);
}
console.log(JSON.stringify({ status: 'pending-or-unknown', action, signature,
  instruction: 'Run status before any new operator action; do not create a replacement intent.' }));
process.exit(1);
