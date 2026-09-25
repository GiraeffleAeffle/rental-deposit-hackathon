import type { RentalWallet } from './types.ts';
import type { WalletChainType } from './identity-policy.ts';

export interface RecoveryChallenge {
  id: string;
  subject: string;
  walletId: string;
  chainType: WalletChainType;
  address: string;
  nonce: string;
  expiresAt: string;
}

export interface RecoverySignature {
  address: string;
  signature: string;
  message: string;
}

const prefix =
  'Rental workspace recovery check\n\nConfirm access to my existing wallet. This does not authorize a transfer.\n\n';
const labels = ['Challenge', 'Account', 'Wallet ID', 'Network', 'Address', 'Nonce', 'Expires'];

export function formatRecoveryMessage(challenge: RecoveryChallenge) {
  const values = [
    challenge.id,
    challenge.subject,
    challenge.walletId,
    challenge.chainType,
    challenge.address,
    challenge.nonce,
    challenge.expiresAt,
  ];
  if (values.some((value) => !value || /[\r\n]/.test(value)))
    throw new Error('Invalid recovery challenge.');
  return prefix + labels.map((label, index) => `${label}: ${values[index]}`).join('\n');
}

export function parseRecoveryMessage(message: string): RecoveryChallenge {
  if (!message.startsWith(prefix) || message.length > 2048)
    throw new Error('This is not a recovery request.');
  const lines = message.slice(prefix.length).split('\n');
  if (lines.length !== labels.length) throw new Error('Invalid recovery challenge.');
  const values = lines.map((line, index) => {
    const label = `${labels[index]}: `;
    if (!line.startsWith(label)) throw new Error('Invalid recovery challenge.');
    return line.slice(label.length);
  });
  const [id, subject, walletId, chainType, address, nonce, expiresAt] = values;
  if (
    !/^[a-zA-Z0-9_-]{16,128}$/.test(id) ||
    !subject.startsWith('did:privy:') ||
    !/^[a-zA-Z0-9_-]{8,128}$/.test(walletId) ||
    (chainType !== 'ethereum' && chainType !== 'solana') ||
    !/^[a-fA-F0-9]{32,128}$/.test(nonce) ||
    !Number.isFinite(Date.parse(expiresAt))
  )
    throw new Error('Invalid recovery challenge.');
  const challenge: RecoveryChallenge = {
    id,
    subject,
    walletId,
    chainType,
    address,
    nonce,
    expiresAt,
  };
  if (formatRecoveryMessage(challenge) !== message) throw new Error('Invalid recovery challenge.');
  return challenge;
}

export function validateRecoveryRequest(
  chainType: WalletChainType,
  message: string,
  subject: string,
  wallets: ReadonlyArray<RentalWallet>,
  now = Date.now(),
) {
  const challenge = parseRecoveryMessage(message);
  if (
    challenge.subject !== subject ||
    challenge.chainType !== chainType ||
    Date.parse(challenge.expiresAt) <= now
  ) {
    throw new Error('The recovery request has expired or belongs to another account.');
  }
  const wallet = wallets.find(
    (candidate) => candidate.id === challenge.walletId && candidate.chainType === chainType,
  );
  const sameAddress =
    chainType === 'ethereum'
      ? wallet?.address.toLowerCase() === challenge.address.toLowerCase()
      : wallet?.address === challenge.address;
  if (!wallet?.connected || !sameAddress)
    throw new Error('Recovery must use the same existing wallet.');
  return { challenge, wallet };
}
