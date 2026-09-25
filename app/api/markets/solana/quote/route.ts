import { readPriceQuote } from '@/server/market-quotes';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  const result = await readPriceQuote(
    new URL(request.url).searchParams.get('amount') || '',
    process.env.JUPITER_API_KEY,
  );
  return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
