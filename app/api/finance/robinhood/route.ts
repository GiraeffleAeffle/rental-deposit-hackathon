import {
  getRobinhoodService,
  robinhoodErrorResponse,
  verifiedRobinhoodIdentity,
} from '@/server/robinhood-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const identity = await verifiedRobinhoodIdentity(request);
    const service = await getRobinhoodService();
    return Response.json(await service.observation(identity), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return robinhoodErrorResponse(error);
  }
}
