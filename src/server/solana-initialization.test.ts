import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
  generateKeyPairSigner,
  getAddressDecoder,
  getTransactionDecoder,
  getTransactionEncoder,
  partiallySignTransaction,
} from '@solana/kit';
import { LocalStore } from './store.ts';
import { agreementDigest, type Agreement } from './agreements.ts';
import {
  createSolanaInitializationService,
  leaseIdForAgreement,
  payoutTokenAccount,
  type InitializationGateway,
  type SolanaInitialization,
} from './solana-initialization.ts';
import type { SolanaConfiguration, SolanaSnapshot } from './solana-rpc.ts';
import { deriveEscrowAddresses, SOLANA_DEVNET_MANIFEST } from '../finance/solana/index.ts';
import type { VerifiedIdentity } from '../wallets/identity-policy.ts';

const addressFor = (byte: number) => getAddressDecoder().decode(new Uint8Array(32).fill(byte));
async function fixture() {
  const [tenant, landlord, arbitrator, sponsor] = await Promise.all(
    Array.from({ length: 4 }, () => generateKeyPairSigner()),
  );
  const store = new LocalStore(':memory:');
  const identity = (role: string, signer: typeof tenant): VerifiedIdentity => ({
    subject: `did:privy:${role}`,
    sessionId: `${role}-session`,
    expiresAt: 9999999999,
    wallets: [{ id: `${role}-wallet`, address: signer.address, chainType: 'solana' }],
    passkeyCount: 1,
    backupLoginLinked: true,
  });
  const identities = {
    tenant: identity('tenant', tenant),
    landlord: identity('landlord', landlord),
    arbitrator: identity('arbitrator', arbitrator),
  };
  const agreement: Agreement = {
    id: 'one-accepted-demo',
    network: 'solana',
    property: 'A reviewed test apartment',
    requiredSecurity: '10000000',
    releaseAllowed: true,
    createdAt: new Date(0).toISOString(),
    revision: 0,
    parties: {
      tenant: { subject: identities.tenant.subject, wallet: identities.tenant.wallets[0] },
      landlord: { subject: identities.landlord.subject, wallet: identities.landlord.wallets[0] },
      arbitrator: { subject: identities.arbitrator.subject, wallet: identities.arbitrator.wallets[0] },
    },
    invitations: {},
    accepted: {},
    records: [],
  };
  const digest = agreementDigest(agreement)!;
  agreement.accepted = {
    tenant: { digest, at: new Date(0).toISOString() },
    landlord: { digest, at: new Date(0).toISOString() },
  };
  await store.create(`agreement:${agreement.id}`, agreement);
  const config = {
    cluster: 'devnet',
    genesisHash: SOLANA_DEVNET_MANIFEST.genesisHash,
    escrowProgram: addressFor(10),
    programSha256: 'a'.repeat(64),
    depositMint: SOLANA_DEVNET_MANIFEST.deposit.mint,
    market: addressFor(11),
    reserve: addressFor(12),
    receiptMint: addressFor(13),
    liquiditySupply: addressFor(14),
    marketAuthority: addressFor(15),
    oracleAccounts: [],
    maxObservationAgeMs: 15000,
    rpcUrl: 'https://rpc.example',
    agreementId: agreement.id,
    programCodeLength: 1000,
    upgradeAuthority: null,
    maximumSponsorLamports: '10000000',
    tenancyAddress: addressFor(16),
  } satisfies SolanaConfiguration;
  const leaseId = leaseIdForAgreement(config, agreement.id);
  const derived = await deriveEscrowAddresses(config.escrowProgram, tenant.address, leaseId);
  config.tenancyAddress = derived.tenancy;
  const [tenantDestination, landlordDestination] = await Promise.all([
    payoutTokenAccount(config, tenant.address),
    payoutTokenAccount(config, landlord.address),
  ]);
  const snapshot: SolanaSnapshot = {
    genesisHash: config.genesisHash,
    slot: '101',
    cashAtomic: '0',
    receiptsAtomic: '0',
    tenantCashAtomic: '10000000',
    landlordCashAtomic: '0',
    receiptValueAtomic: '0',
    availableLiquidityAtomic: '10000000',
    requiresRefresh: false,
    tenancy: {
      address: derived.tenancy,
      leaseId,
      tenant: tenant.address,
      landlord: landlord.address,
      arbitrator: arbitrator.address,
      depositMint: config.depositMint,
      reserve: config.reserve,
      market: config.market,
      receiptMint: config.receiptMint,
      liquiditySupply: config.liquiditySupply,
      marketAuthority: config.marketAuthority,
      tenantDestination,
      landlordDestination,
      policyHash: new Uint8Array(Buffer.from(digest.slice(2), 'hex')),
      releasePermitted: true,
      requiredSecurityAtomic: agreement.requiredSecurity,
      accountedIdleAtomic: '0',
      accountedReceiptsAtomic: '0',
      releasedEarningsAtomic: '0',
      nextNonce: '0',
      claimAtomic: '0',
      approvedClaimAtomic: '0',
      phase: 'awaiting-funding',
      bump: derived.bump,
    },
  };
  const state = { now: 100000, blockHeight: '100', sponsorCost: '8500000', final: false, sent: [] as string[], preflights: 0 };
  const gateway: InitializationGateway = {
    preflight: async (input) => {
      state.preflights++;
      assert.equal(input.tenancyAddress, derived.tenancy);
      assert.equal(input.tenantDestination, tenantDestination);
      assert.equal(input.landlordDestination, landlordDestination);
    },
    lifetime: async () => ({ blockhash: addressFor(30), lastValidBlockHeight: '300', blockHeight: state.blockHeight }),
    simulate: async () => ({ slot: '100', sponsorDebitCeilingLamports: state.sponsorCost, networkFeeLamports: '15000' }),
    broadcast: async (bytes) => {
      const recordId = createHash('sha256')
        .update(`${config.genesisHash}:${config.tenancyAddress}`)
        .digest('hex');
      const record = await store.get<SolanaInitialization>(`solana-initialization:${recordId}`);
      assert.equal(record?.signedTxBase64, Buffer.from(bytes).toString('base64'));
      assert.equal(record?.state, 'signed');
      state.sent.push(Buffer.from(bytes).toString('base64'));
      assert.ok(record.signature);
      return record.signature;
    },
    reconcile: async (signature) => state.final
      ? { status: 'finalized', signature, slot: '101', deltas: [] }
      : { status: 'unknown', reason: 'signature-not-observed-do-not-resubmit-new-intent' },
    snapshot: async () => structuredClone(snapshot),
  };
  const feeSponsor = {
    address: sponsor.address,
    sign: async (bytes: Uint8Array) =>
      new Uint8Array(getTransactionEncoder().encode(
        await partiallySignTransaction([sponsor.keyPair], getTransactionDecoder().decode(bytes)),
      )),
  };
  const recoveryGate = async () => ({ wallet: identities.tenant.wallets[0], proof: null });
  const service = createSolanaInitializationService({
    store, config, gateway, sponsor: feeSponsor, now: () => state.now,
    recoveryGate: recoveryGate as never,
  });
  const sign = async (encoded: string, actor: typeof tenant) =>
    Buffer.from(getTransactionEncoder().encode(
      await partiallySignTransaction(
        [actor.keyPair],
        getTransactionDecoder().decode(Buffer.from(encoded, 'base64')),
      ),
    )).toString('base64');
  return { store, config, state, service, identities, tenant, landlord, arbitrator, sign, snapshot };
}

test('separate recovered wallets sign one accepted agreement; sponsor persists before send', async () => {
  const f = await fixture();
  const plan = await f.service.prepare(f.identities.tenant);
  assert.equal(plan.policyHash, agreementDigest((await f.store.get<Agreement>('agreement:one-accepted-demo'))!)!.slice(2));
  assert.equal(plan.tenancyAddress, f.config.tenancyAddress);
  assert.deepEqual(plan.signedRoles, []);
  const same = await f.service.prepare(f.identities.landlord);
  assert.equal(same.messageSha256, plan.messageSha256);
  const first = await f.service.sign(f.identities.tenant, await f.sign(plan.transactionBase64, f.tenant));
  assert.deepEqual(first.signedRoles, ['tenant']);
  assert.equal(f.state.sent.length, 0);
  const second = await f.service.sign(f.identities.landlord, await f.sign(plan.transactionBase64, f.landlord));
  assert.deepEqual(second.signedRoles, ['tenant', 'landlord']);
  assert.equal(second.state, 'broadcast');
  assert.equal(f.state.sent.length, 1);
  f.state.final = true;
  const final = await f.service.reconcile(f.identities.arbitrator);
  assert.equal(final.state, 'finalized');
  assert.equal(final.signature, second.signature);
  await f.store.close();
});

test('changed message, wrong signer and expired blockhash cannot authorize setup', async () => {
  const f = await fixture();
  const plan = await f.service.prepare(f.identities.tenant);
  const wrong = await f.sign(plan.transactionBase64, f.landlord);
  await assert.rejects(f.service.sign(f.identities.tenant, wrong), /signature did not verify/);
  const modified = Buffer.from(plan.transactionBase64, 'base64');
  modified[modified.length - 1] ^= 1;
  const changed = modified.toString('base64');
  await assert.rejects(f.service.sign(f.identities.tenant, changed), /message differs/);
  f.state.blockHeight = '300';
  await assert.rejects(
    f.service.sign(f.identities.tenant, await f.sign(plan.transactionBase64, f.tenant)),
    /Refresh the initialization/,
  );
  await f.store.close();
});

test('sponsor rent ceiling fails before signature collection', async () => {
  const f = await fixture();
  f.state.sponsorCost = '10000001';
  await assert.rejects(f.service.prepare(f.identities.tenant), /sponsor limit/);
  assert.equal((await f.service.status(f.identities.tenant)).initialization, null);
  await f.store.close();
});
