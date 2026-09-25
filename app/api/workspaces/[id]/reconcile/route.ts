import { getStore } from '@/server/store';
import { reconcileDemo } from '@/server/workspaces';
import { demoAccess, errorResponse, readBody, sameOrigin } from '@/server/http';

export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request);
    const { id } = await context.params;
    const body = await readBody(request);
    const access = demoAccess(request, body.role);
    const state = await reconcileDemo(
      await getStore(),
      id,
      access,
      typeof body.operationId === 'string' ? body.operationId : undefined,
      body.simulateFailure === true,
    );
    return Response.json({ state }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
