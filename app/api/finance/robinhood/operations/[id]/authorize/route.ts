import {
  getRobinhoodService,
  robinhoodErrorResponse,
  verifiedRobinhoodIdentity,
} from '@/server/robinhood-service';
import { readBody, sameOrigin } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request);
    const identity = await verifiedRobinhoodIdentity(request);
    const { id } = await context.params;
    const service = await getRobinhoodService();
    return Response.json(await service.authorize(identity, id, await readBody(request)), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return robinhoodErrorResponse(error);
  }
}
