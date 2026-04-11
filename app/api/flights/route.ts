import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

const DESTINATIONS: Record<string, string[]> = {
  'Europe':        ['CDG','FCO','BCN','AMS','LHR','PRG','VIE','LIS','CPH','ZRH'],
  'Asia':          ['BKK','NRT','SIN','HKG','DXB','KUL','ICN','DEL','MNL','CGK'],
  'North America': ['CUN','MIA','LAX','YYZ','MEX','ORD','LAS','SFO','YVR','PTY'],
  'South America': ['GRU','BOG','LIM','EZE','SCL','GIG','UIO','VCP'],
  'Africa':        ['CPT','NBO','CMN','LOS','JNB','CAI','ACC','TUN'],
  'Oceania':       ['SYD','AKL','MEL','BNE','PER','CHC','ADL'],
  'Antarctica':    ['USH'],
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const continent = searchParams.get('continent');
  const origin = searchParams.get('origin');
  const excludeParam = searchParams.get('exclude') ?? '';

  if (!continent || !origin) {
    return NextResponse.json({ error: 'continent and origin required' }, { status: 400 });
  }

  const exclude = new Set(excludeParam.split(',').map(s => s.trim()).filter(Boolean));
  const candidates = DESTINATIONS[continent] ?? [];
  const destination_iata = candidates.find(d => d !== origin && !exclude.has(d)) ?? null;

  if (!destination_iata) {
    return NextResponse.json({ price_usd: null, destination_iata: null, provider: 'no-destination' });
  }

  // Check cache (fresh within 6 hours)
  const cached = await query(
    `SELECT price_usd, provider FROM flight_cache
     WHERE origin_iata = $1 AND destination_iata = $2
       AND fetched_at > NOW() - INTERVAL '6 hours'`,
    [origin, destination_iata]
  );
  if (cached.rows.length > 0) {
    return NextResponse.json({
      price_usd: cached.rows[0].price_usd,
      destination_iata,
      provider: cached.rows[0].provider,
      cached: true,
    });
  }

  const SERPAPI_KEY = process.env.SERPAPI_KEY;
  if (!SERPAPI_KEY) {
    // TODO: remove mock price before production
    return NextResponse.json({ price_usd: 420, destination_iata, provider: 'mock', cached: false });
  }

  try {
    const outboundDate = new Date();
    outboundDate.setDate(outboundDate.getDate() + 30);
    const dateStr = outboundDate.toISOString().slice(0, 10);

    const url = new URL('https://serpapi.com/search.json');
    url.searchParams.set('engine', 'google_flights');
    url.searchParams.set('departure_id', origin);
    url.searchParams.set('arrival_id', destination_iata);
    url.searchParams.set('outbound_date', dateStr);
    url.searchParams.set('currency', 'USD');
    url.searchParams.set('hl', 'en');
    url.searchParams.set('api_key', SERPAPI_KEY);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`SerpAPI ${res.status}`);
    const data = await res.json();

    const price: number | null =
      data.best_flights?.[0]?.price ?? data.other_flights?.[0]?.price ?? null;

    await query(
      `INSERT INTO flight_cache (origin_iata, destination_iata, price_usd, provider)
       VALUES ($1, $2, $3, 'serpapi')
       ON CONFLICT (origin_iata, destination_iata) DO UPDATE
         SET price_usd = EXCLUDED.price_usd, fetched_at = NOW()`,
      [origin, destination_iata, price]
    );

    return NextResponse.json({ price_usd: price, destination_iata, provider: 'serpapi', cached: false });
  } catch {
    // TODO: remove mock price before production
    return NextResponse.json({ price_usd: 420, destination_iata, provider: 'mock', cached: false });
  }
}
