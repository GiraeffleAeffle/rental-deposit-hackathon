import { connectionStatus } from '@/server/configuration';
import { getStore } from '@/server/store';
export const runtime = 'nodejs';
export async function GET() {
  let storeAvailable = false;
  try {
    await (await getStore()).get('healthcheck');
    storeAvailable = true;
  } catch {
    /* Configuration state is returned without secrets. */
  }
  return Response.json(
    { ...connectionStatus(process.env), storeAvailable },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
