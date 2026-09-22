import { solanaPost } from '../../../_handlers';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return solanaPost(request, 'authorize', (await context.params).id);
}
