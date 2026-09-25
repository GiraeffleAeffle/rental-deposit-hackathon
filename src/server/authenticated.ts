import 'server-only';
import { verifyPrivyToken, IdentityError } from './identity.ts';
export async function authenticated(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ') || authorization.length > 12000)
    throw new IdentityError('unauthenticated', 'Sign in before continuing.');
  return verifyPrivyToken(authorization.slice(7));
}
