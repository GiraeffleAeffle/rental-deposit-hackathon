import 'server-only';

import { PrivyClient } from '@privy-io/node';
import { isAddress as isSolanaAddress } from '@solana/kit';
import { isAddress as isEthereumAddress } from 'viem';
import { createIdentityVerifier, IdentityError } from '../wallets/identity-policy.ts';

export { IdentityError };
export type { VerifiedIdentity, VerifiedWallet } from '../wallets/identity-policy.ts';

let configuredVerifier: ReturnType<typeof createIdentityVerifier> | undefined;

/** Verifies an access token and current wallet ownership; never signs or assigns roles. */
export async function verifyPrivyToken(token: string) {
  if (!configuredVerifier) {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
    const appSecret = process.env.PRIVY_APP_SECRET?.trim();
    if (!appId || !appSecret) {
      throw new IdentityError('identity_unavailable', 'Account access is not configured yet.');
    }
    const client = new PrivyClient({
      appId,
      appSecret,
      jwtVerificationKey: process.env.PRIVY_VERIFICATION_KEY?.replace(/\\n/g, '\n'),
      timeout: 10_000,
      maxRetries: 1,
    });
    configuredVerifier = createIdentityVerifier({
      appId,
      verifyToken: async (accessToken) => {
        const claims = await client.utils().auth().verifyAccessToken(accessToken);
        return {
          appId: claims.app_id,
          subject: claims.user_id,
          issuer: claims.issuer,
          expiresAt: claims.expiration,
          sessionId: claims.session_id,
        };
      },
      getUser: (subject) => client.users()._get(subject),
      getWallet: (id) => client.wallets().get(id),
      getOwner: (id) => client.keyQuorums().get(id),
      isValidAddress: (address, chainType) =>
        chainType === 'solana' ? isSolanaAddress(address) : isEthereumAddress(address),
    });
  }
  return configuredVerifier(token);
}
