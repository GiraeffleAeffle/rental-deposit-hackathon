import { solanaGet } from '../../_handlers';
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return solanaGet(request, (await context.params).id);
}
