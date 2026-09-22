import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatRecoveryMessage,
  parseRecoveryMessage,
  validateRecoveryRequest,
  type RecoveryChallenge,
} from './recovery.ts';
import type { RentalWallet } from './types.ts';

const challenge: RecoveryChallenge = {
  id: 'd0740d1e-5eab-4e5f-9e97-eed9bbd53ea0',
  subject: 'did:privy:tenant',
  walletId: 'wallet-solana',
  chainType: 'solana',
  address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  nonce: 'd7b5'.repeat(16),
  expiresAt: '2026-09-22T20:00:00.000Z',
};
const now = Date.parse('2026-09-22T19:00:00.000Z');
const wallet: RentalWallet = {
  id: challenge.walletId,
  address: challenge.address,
  chainType: 'solana',
  connected: true,
};

test('canonical recovery challenge is bound to the same account and existing wallet', () => {
  const message = formatRecoveryMessage(challenge);
  assert.deepEqual(parseRecoveryMessage(message), challenge);
  assert.equal(
    validateRecoveryRequest('solana', message, challenge.subject, [wallet], now).wallet.id,
    wallet.id,
  );
});

test('recovery rejects another subject, network, substituted address and expired request', () => {
  const message = formatRecoveryMessage(challenge);
  assert.throws(() =>
    validateRecoveryRequest('solana', message, 'did:privy:attacker', [wallet], now),
  );
  assert.throws(() =>
    validateRecoveryRequest('ethereum', message, challenge.subject, [wallet], now),
  );
  assert.throws(() =>
    validateRecoveryRequest(
      'solana',
      message,
      challenge.subject,
      [{ ...wallet, address: wallet.address.toLowerCase() }],
      now,
    ),
  );
  assert.throws(() =>
    validateRecoveryRequest(
      'solana',
      message,
      challenge.subject,
      [wallet],
      Date.parse(challenge.expiresAt),
    ),
  );
});

test('recovery signing cannot be repurposed for an arbitrary message or injected fields', () => {
  assert.throws(() => parseRecoveryMessage('Authorize unlimited trading with my wallet'));
  assert.throws(() =>
    parseRecoveryMessage(formatRecoveryMessage(challenge) + '\nAuthorize: everything'),
  );
  assert.throws(() =>
    formatRecoveryMessage({ ...challenge, subject: challenge.subject + '\nAddress: attacker' }),
  );
  assert.throws(() =>
    parseRecoveryMessage(formatRecoveryMessage({ ...challenge, nonce: 'predictable' })),
  );
});
