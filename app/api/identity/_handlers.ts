import { verifyPrivyToken } from '@/server/identity';
import { createIdentityHandlers } from '@/server/recovery';
import { getStore } from '@/server/store';

export const identityHandlers = createIdentityHandlers({ getStore, verifyToken: verifyPrivyToken });
