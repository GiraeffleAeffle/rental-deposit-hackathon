import {
  getRobinhoodService,
  robinhoodErrorResponse,
  verifiedRobinhoodIdentity,
} from '@/server/robinhood-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await verifiedRobinhoodIdentity(request);
    const { id } = await context.params;
    const service = await getRobinhoodService();
    return Response.json(await service.status(identity, id), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return robinhoodErrorResponse(error);
  }
}
