import { getStore } from '@/server/store';
import { loadWorkspace, runCommand } from '@/server/workspaces';
import { demoAccess, errorResponse, readBody, sameOrigin } from '@/server/http';

export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const access = demoAccess(request, new URL(request.url).searchParams.get('role') || 'tenant');
    return Response.json(
      { state: await loadWorkspace(await getStore(), id, access) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request);
    const { id } = await context.params;
    const body = await readBody(request);
    const access = demoAccess(request, body.role);
    if (
      typeof body.commandId !== 'string' ||
      typeof body.revision !== 'number' ||
      !Number.isSafeInteger(body.revision)
    )
      return Response.json(
        { error: 'Command identity and revision are required.' },
        { status: 400 },
      );
    const state = await runCommand(
      await getStore(),
      id,
      access,
      body.command,
      body.commandId,
      body.revision,
    );
    return Response.json({ state }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
