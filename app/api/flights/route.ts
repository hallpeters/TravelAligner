import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

const ORIGIN_IATA = 'JFK';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');

  if (!start || !end) {
    return NextResponse.json({ error: 'start and end required' }, { status: 400 });
  }

  // Check cache (fresh within 6 hours)
  const cached = await query(
    `SELECT price_usd, provider FROM flight_cache
     WHERE trip_start = $1 AND trip_end = $2
       AND fetched_at > NOW() - INTERVAL '6 hours'`,
    [start, end]
  );
  if (cached.rows.length > 0) {
    return NextResponse.json({ price_usd: cached.rows[0].price_usd, provider: cached.rows[0].provider, cached: true });
  }

  const SERPAPI_KEY = process.env.SERPAPI_KEY;
  if (!SERPAPI_KEY) {
    // TODO: remove mock price before production — only here for visual testing without an API key
    return NextResponse.json({ price_usd: 420, provider: 'mock', cached: false });
  }

  // Call SerpAPI
  try {
    const url = new URL('https://serpapi.com/search.json');
    url.searchParams.set('engine', 'google_flights');
    url.searchParams.set('departure_id', ORIGIN_IATA);
    url.searchParams.set('arrival_id', 'ANY');
    url.searchParams.set('outbound_date', start);
    url.searchParams.set('currency', 'USD');
    url.searchParams.set('hl', 'en');
    url.searchParams.set('api_key', SERPAPI_KEY);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`SerpAPI ${res.status}`);
    const data = await res.json();

    const price: number | null =
      data.best_flights?.[0]?.price ?? data.other_flights?.[0]?.price ?? null;

    // Upsert into cache
    await query(
      `INSERT INTO flight_cache (trip_start, trip_end, price_usd, provider)
       VALUES ($1, $2, $3, 'serpapi')
       ON CONFLICT (trip_start, trip_end) DO UPDATE
         SET price_usd = EXCLUDED.price_usd, fetched_at = NOW()`,
      [start, end, price]
    );

    return NextResponse.json({ price_usd: price, provider: 'serpapi', cached: false });
  } catch {
    // TODO: remove mock price before production — only here for visual testing without an API key
    return NextResponse.json({ price_usd: 420, provider: 'mock', cached: false });
  }
}
