import {
  getRobinhoodService,
  robinhoodErrorResponse,
  verifiedRobinhoodIdentity,
} from '@/server/robinhood-service';
import { RobinhoodServiceError } from '@/server/robinhood-service';
import { readBody, sameOrigin } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request);
    const identity = await verifiedRobinhoodIdentity(request);
    const { id } = await context.params;
    const body = await readBody(request);
    if (Object.keys(body).length)
      throw new RobinhoodServiceError(
        'invalid_request',
        'Reconciliation accepts an empty object.',
        400,
      );
    const service = await getRobinhoodService();
    return Response.json(await service.reconcile(identity, id), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return robinhoodErrorResponse(error);
  }
}
