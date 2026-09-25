import {
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  isAddress as isSolanaAddress,
} from '@solana/kit';
import { isAddress as isEthereumAddress } from 'viem';
import type {
  EvmSigningRequest,
  RentalWallet,
  SigningReview,
  SolanaSigningRequest,
} from './types.ts';

function assertFreshReview(review: SigningReview, now: number) {
  if (!review.operationId.trim() || !review.description.trim()) {
    throw new Error('Review an operation before signing.');
  }
  const expiry = Date.parse(review.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now) {
    throw new Error('This request has expired. Refresh it before signing.');
  }
}

function assertWallet(
  wallet: RentalWallet | undefined,
  id: string,
  chainType: 'ethereum' | 'solana',
) {
  if (!wallet || wallet.id !== id || wallet.chainType !== chainType || !wallet.connected) {
    throw new Error('Your selected wallet is not available. Sign in again.');
  }
  return wallet;
}

export function validateEvmSigningRequest(
  request: EvmSigningRequest,
  wallet: RentalWallet | undefined,
  now = Date.now(),
) {
  assertFreshReview(request, now);
  const selected = assertWallet(wallet, request.walletId, 'ethereum');
  const transaction = request.transaction;
  if (transaction.chainId !== 4663 && transaction.chainId !== 46630) {
    throw new Error('This wallet flow supports Robinhood Chain only.');
  }
  if (!isEthereumAddress(transaction.to))
    throw new Error('The transaction destination is invalid.');
  if (transaction.from && transaction.from.toLowerCase() !== selected.address.toLowerCase()) {
    throw new Error('The transaction was prepared for another wallet.');
  }
  return selected;
}

export function validateSolanaSigningRequest(
  request: SolanaSigningRequest,
  wallet: RentalWallet | undefined,
  now = Date.now(),
) {
  assertFreshReview(request, now);
  const selected = assertWallet(wallet, request.walletId, 'solana');
  if (request.chain !== 'solana:mainnet' && request.chain !== 'solana:devnet') {
    throw new Error('The Solana network is not supported.');
  }
  if (!isSolanaAddress(request.feePayer) || request.feePayer === selected.address) {
    throw new Error('This flow requires a separate fee sponsor.');
  }
  if (request.transaction.length <= 64 || request.transaction.length > 1232) {
    throw new Error('The Solana transaction is invalid.');
  }
  const transaction = getTransactionDecoder().decode(request.transaction);
  const message = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
  if (message.staticAccounts[0] !== request.feePayer) {
    throw new Error('The transaction fee payer does not match the sponsor.');
  }
  if (!(selected.address in transaction.signatures)) {
    throw new Error('The transaction was prepared for another wallet.');
  }
  return { wallet: selected, messageBytes: transaction.messageBytes };
}

export function assertUnchangedSolanaMessage(before: Uint8Array, signed: Uint8Array) {
  const after = getTransactionDecoder().decode(signed).messageBytes;
  if (before.length !== after.length || before.some((byte, index) => byte !== after[index])) {
    throw new Error('The signed transaction differs from the reviewed request.');
  }
}
