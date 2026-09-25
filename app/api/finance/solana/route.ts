import { solanaGet } from './_handlers';
export const runtime = 'nodejs';
export const GET = (request: Request) => solanaGet(request);
