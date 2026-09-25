import { solanaPost } from '../_handlers';
export const runtime = 'nodejs';
export const POST = (request: Request) => solanaPost(request, 'prepare');
