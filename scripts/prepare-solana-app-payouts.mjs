#!/usr/bin/env node

// Operator-only setup for a recorded, accepted Privy tenancy on pinned devnet.
// The sponsor creates each party's own test-USDC account; it never owns the tokens.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import {
  AccountRole,
  address,
  appendTransactionMessageInstruction,
  blockhash,
  compileTransaction,
  createTransactionMessage,
  getBase58Decoder,
  getTransactionDecoder,
  getTransactionEncoder,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/kit';
import { agreementDigest } from '../src/server/agreements.ts';
import { decodeClassicTokenAccount } from '../src/finance/solana/observations.ts';
import { deriveEscrowAddresses } from '../src/finance/solana/program.ts';
import { SOLANA_DEVNET_MANIFEST, SOLANA_IDS } from '../src/finance/solana/manifest.ts';
import { configuredFeeSponsor } from '../src/server/solana-service.ts';
import {
  leaseIdForAgreement,
  payoutTokenAccount,
  RpcInitializationGateway,
} from '../src/server/solana-initialization.ts';
import { solanaConfiguration } from '../src/server/solana-rpc.ts';

const agreementId = process.argv[2];
const send = process.argv[3] === '--send';
if (!/^[a-zA-Z0-9_-]{1,160}$/.test(agreementId ?? '') || process.argv.length !== (send ? 4 : 3)) {
  console.error(
    'Usage: node --env-file-if-exists=.env.local --experimental-strip-types scripts/prepare-solana-app-payouts.mjs AGREEMENT_ID [--send]',
  );
  process.exit(2);
}
if (process.env.DATABASE_URL)
  throw new Error('This operator setup requires the local test database');
const database = new DatabaseSync(
  resolve(process.env.LOCAL_DATABASE_PATH || '.data/rental.sqlite'),
  {
    readOnly: true,
  },
);
const row = database
  .prepare('SELECT body FROM rental_records WHERE key = ?')
  .get(`agreement:${agreementId}`);
database.close();
const agreement = row ? JSON.parse(row.body) : null;
if (!agreement || agreement.network !== 'solana')
  throw new Error('Recorded Solana agreement missing');
const digest = agreementDigest(agreement);
if (
  !digest ||
  agreement.accepted.tenant?.digest !== digest ||
  agreement.accepted.landlord?.digest !== digest
)
  throw new Error('Tenant and landlord must accept the complete agreement first');

const evidence = JSON.parse(
  await readFile(
    new URL('../docs/evidence/SOLANA_DEVNET_DEPLOYMENT_2026-09-23.json', import.meta.url),
    'utf8',
  ),
);
if (
  !evidence.operatorOnly ||
  evidence.cluster !== 'devnet' ||
  evidence.genesisHash !== SOLANA_DEVNET_MANIFEST.genesisHash ||
  evidence.depositMint !== SOLANA_DEVNET_MANIFEST.deposit.mint
)
  throw new Error('Pinned test deployment evidence missing');
const tenant = agreement.parties.tenant.wallet.address;
const landlord = agreement.parties.landlord.wallet.address;
const base = {
  cluster: 'devnet',
  genesisHash: evidence.genesisHash,
  escrowProgram: evidence.escrowProgram,
  programSha256: evidence.programSha256,
  programCodeLength: evidence.programCodeLength,
  upgradeAuthority: evidence.upgradeAuthority,
  depositMint: evidence.depositMint,
  reserve: evidence.reserve,
  market: evidence.market,
  receiptMint: evidence.receiptMint,
  liquiditySupply: evidence.liquiditySupply,
  marketAuthority: evidence.marketAuthority,
  oracleAccounts: evidence.oracleAccounts,
  maxObservationAgeMs: 15_000,
  agreementId,
  tenancyAddress: '',
  maximumSponsorLamports: '10000000',
};
const leaseId = leaseIdForAgreement(base, agreementId);
base.tenancyAddress = (await deriveEscrowAddresses(base.escrowProgram, tenant, leaseId)).tenancy;
const config = solanaConfiguration({
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  SOLANA_DEPLOYMENT_MANIFEST: JSON.stringify(base),
});
if (!config) throw new Error('Pinned Solana configuration unavailable');
const sponsor = await configuredFeeSponsor();
if (
  !sponsor ||
  [tenant, landlord, agreement.parties.arbitrator.wallet.address].includes(sponsor.address)
)
  throw new Error('A separate devnet fee sponsor is required');
const gateway = new RpcInitializationGateway(config);
await gateway.checkedGenesis();

const owners = [tenant, landlord];
const destinations = await Promise.all(owners.map((owner) => payoutTokenAccount(config, owner)));
const observations = await gateway.multiple(destinations);
const missing = [];
for (let i = 0; i < owners.length; i++) {
  const row = observations.accounts[i];
  if (!row) {
    missing.push(i);
    continue;
  }
  const token = decodeClassicTokenAccount(row);
  if (
    token.authority !== owners[i] ||
    token.mint !== config.depositMint ||
    !token.initialized ||
    token.frozen
  )
    throw new Error('An existing payout account does not match its party and test mint');
}
if (!missing.length) {
  console.log(JSON.stringify({ status: 'already-ready', agreementId, destinations }));
  process.exit(0);
}

const lifetime = await gateway.lifetime();
let message = setTransactionMessageLifetimeUsingBlockhash(
  {
    blockhash: blockhash(lifetime.blockhash),
    lastValidBlockHeight: BigInt(lifetime.lastValidBlockHeight),
  },
  setTransactionMessageFeePayer(address(sponsor.address), createTransactionMessage({ version: 0 })),
);
for (const i of missing) {
  message = appendTransactionMessageInstruction(
    {
      programAddress: address(SOLANA_IDS.associatedToken),
      data: Uint8Array.of(1), // SPL Associated Token Account: CreateIdempotent.
      accounts: [
        { address: address(sponsor.address), role: AccountRole.WRITABLE_SIGNER },
        { address: address(destinations[i]), role: AccountRole.WRITABLE },
        { address: address(owners[i]), role: AccountRole.READONLY },
        { address: address(config.depositMint), role: AccountRole.READONLY },
        { address: address(SOLANA_IDS.system), role: AccountRole.READONLY },
        { address: address(SOLANA_IDS.token), role: AccountRole.READONLY },
      ],
    },
    message,
  );
}
const unsigned = new Uint8Array(getTransactionEncoder().encode(compileTransaction(message)));
if (unsigned.length > 1232) throw new Error('Account-setup transaction is too large');
const simulation = await gateway.simulate(unsigned, sponsor.address, tenant);
const signed = await sponsor.sign(unsigned);
const signedSimulation = await gateway.rpc('simulateTransaction', [
  Buffer.from(signed).toString('base64'),
  { encoding: 'base64', sigVerify: true, replaceRecentBlockhash: false, commitment: 'finalized' },
]);
if (signedSimulation.value?.err !== null)
  throw new Error('Signed account-setup transaction failed simulation');
const signature = getBase58Decoder().decode(
  getTransactionDecoder().decode(signed).signatures[address(sponsor.address)],
);
console.log(
  JSON.stringify({
    status: send ? 'ready-to-send' : 'simulation-passed',
    agreementId,
    cluster: config.cluster,
    sponsor: sponsor.address,
    missingRoles: missing.map((i) => ['tenant', 'landlord'][i]),
    destinations,
    sponsorDebitCeilingLamports: simulation.sponsorDebitCeilingLamports,
    signature,
  }),
);
if (!send) process.exit(0);

const returned = await gateway.broadcast(signed);
if (returned !== signature) throw new Error('RPC returned a different signature');
for (let attempt = 0; attempt < 40; attempt++) {
  const status = await gateway.rpc('getSignatureStatuses', [
    [signature],
    { searchTransactionHistory: true },
  ]);
  const receipt = status.value?.[0];
  if (receipt?.err) throw new Error('Devnet payout-account creation failed');
  if (receipt?.confirmationStatus === 'finalized') {
    const final = await gateway.multiple(destinations);
    for (let i = 0; i < owners.length; i++) {
      if (!final.accounts[i]) throw new Error('Finalized transaction lacks a payout account');
      const token = decodeClassicTokenAccount(final.accounts[i]);
      if (
        token.authority !== owners[i] ||
        token.mint !== config.depositMint ||
        !token.initialized ||
        token.frozen
      )
        throw new Error('Finalized payout account differs from the reviewed destination');
    }
    console.log(
      JSON.stringify({ status: 'finalized', signature, slot: receipt.slot, destinations }),
    );
    process.exit(0);
  }
  await delay(1500);
}
throw new Error(`Transaction status unknown; inspect ${signature} before retrying`);
