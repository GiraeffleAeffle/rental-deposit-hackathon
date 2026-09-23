#!/usr/bin/env node

// Read-only operator plan for a real accepted Privy agreement; never uses the rehearsal parties.
import { readFile } from 'node:fs/promises';
import { agreementDigest } from '../src/server/agreements.ts';
import { getStore } from '../src/server/store.ts';
import {
  leaseIdForAgreement,
  payoutTokenAccount,
  RpcInitializationGateway,
} from '../src/server/solana-initialization.ts';
import { deriveEscrowAddresses } from '../src/finance/solana/program.ts';
import { solanaConfiguration } from '../src/server/solana-rpc.ts';

const agreementId = process.argv[2];
if (process.argv.length !== 3 || !/^[a-zA-Z0-9_-]{1,160}$/.test(agreementId ?? '')) {
  console.error('Usage: node --env-file-if-exists=.env.local --experimental-strip-types scripts/plan-solana-app-tenancy.mjs AGREEMENT_ID');
  process.exit(2);
}
const agreement = await (await getStore()).get(`agreement:${agreementId}`);
if (!agreement || agreement.network !== 'solana') throw new Error('A recorded Solana agreement is required');
const digest = agreementDigest(agreement);
if (!digest || agreement.accepted.tenant?.digest !== digest || agreement.accepted.landlord?.digest !== digest)
  throw new Error('All three people must join and tenant and landlord must accept the same digest');
const evidence = JSON.parse(
  await readFile(new URL('../docs/evidence/SOLANA_DEVNET_DEPLOYMENT_2026-09-23.json', import.meta.url), 'utf8'),
);
if (!evidence.operatorOnly || evidence.cluster !== 'devnet')
  throw new Error('The pinned devnet deployment evidence is unavailable');
const tenant = agreement.parties.tenant.wallet.address;
const landlord = agreement.parties.landlord.wallet.address;
const arbitrator = agreement.parties.arbitrator.wallet.address;
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
  maxObservationAgeMs: 15000,
  agreementId,
  tenancyAddress: '',
  maximumSponsorLamports: '10000000',
};
const leaseId = leaseIdForAgreement(base, agreementId);
const derived = await deriveEscrowAddresses(base.escrowProgram, tenant, leaseId);
base.tenancyAddress = derived.tenancy;
const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const config = solanaConfiguration({
  SOLANA_RPC_URL: rpcUrl,
  SOLANA_DEPLOYMENT_MANIFEST: JSON.stringify(base),
});
if (!config) throw new Error('Could not validate the deployment manifest');
const [tenantDestination, landlordDestination] = await Promise.all([
  payoutTokenAccount(config, tenant),
  payoutTokenAccount(config, landlord),
]);
const gateway = new RpcInitializationGateway(config);
await gateway.checkedGenesis();
const payoutAccounts = await gateway.multiple([tenantDestination, landlordDestination]);
const missingPayouts = [tenantDestination, landlordDestination].filter(
  (_, index) => !payoutAccounts.accounts[index],
);
console.log(JSON.stringify({
  agreementId,
  policyHash: digest.slice(2),
  tenant,
  landlord,
  arbitrator,
  leaseIdHex: Buffer.from(leaseId).toString('hex'),
  tenancyAddress: derived.tenancy,
  cashAddress: derived.cash,
  receiptAddress: derived.receipts,
  tenantDestination,
  landlordDestination,
  missingPayouts,
  rpcUrl,
  deploymentManifest: base,
  next: missingPayouts.length
    ? 'Create the missing associated test-USDC payout accounts before requesting app initialization.'
    : 'Set the server-only SOLANA_DEPLOYMENT_MANIFEST and separate SOLANA_SPONSOR_KEYPAIR, restart the app, then open Initialize the Solana tenancy.',
}, null, 2));
