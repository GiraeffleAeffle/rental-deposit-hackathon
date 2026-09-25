import { randomBytes } from 'node:crypto';
import { getStore } from '@/server/store';
import { decodeNetwork, openDemo } from '@/server/workspaces';
import { demoSession, errorResponse, readBody, sameOrigin } from '@/server/http';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const body = await readBody(request);
    const network = decodeNetwork(body.network);
    const session = demoSession(request) || randomBytes(32).toString('hex');
    const state = await openDemo(await getStore(), session, network, body.restart === true);
    const secure =
      new URL(process.env.APP_ORIGIN || request.url).protocol === 'https:' ? '; Secure' : '';
    return Response.json(
      { state },
      {
        headers: {
          'Cache-Control': 'no-store',
          'Set-Cookie': `rental_demo=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secure}`,
        },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
