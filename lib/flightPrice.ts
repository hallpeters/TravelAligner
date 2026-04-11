import { query } from '@/lib/db';
import { AIRPORTS } from '@/lib/airports';

export const CONTINENT_DESTINATIONS: Record<string, string[]> = {
  'Europe':        ['CDG','FCO','BCN','AMS','LHR','PRG','VIE','LIS','CPH','ZRH'],
  'Asia':          ['BKK','NRT','SIN','HKG','DXB','KUL','ICN','DEL','MNL','CGK'],
  'North America': ['CUN','MIA','LAX','YYZ','MEX','ORD','LAS','SFO','YVR','PTY'],
  'South America': ['GRU','BOG','LIM','EZE','SCL','GIG','UIO','VCP'],
  'Africa':        ['CPT','NBO','CMN','LOS','JNB','CAI','ACC','TUN'],
  'Oceania':       ['SYD','AKL','MEL','BNE','PER','CHC','ADL'],
  'Antarctica':    ['USH'],
};

const airportMap = new Map<string, { iata: string; name: string; city: string; country: string }>(
  AIRPORTS.map(a => [a.iata as string, { iata: a.iata as string, name: a.name as string, city: a.city as string, country: a.country as string }])
);

export function getAirportCity(iata: string): string | null {
  return airportMap.get(iata)?.city ?? null;
}

export function pickDestination(continent: string, origin: string, exclude: string[]): string | null {
  const excludeSet = new Set(exclude);
  return CONTINENT_DESTINATIONS[continent]?.find(d => d !== origin && !excludeSet.has(d)) ?? null;
}

async function checkCache(origin: string, destination: string): Promise<number | null> {
  try {
    const result = await query(
      `SELECT price_usd FROM flight_cache
       WHERE origin_iata = $1 AND destination_iata = $2
         AND fetched_at > NOW() - INTERVAL '6 hours'`,
      [origin, destination]
    );
    return result.rows.length > 0 ? (result.rows[0] as { price_usd: number | null }).price_usd : null;
  } catch {
    return null; // table may not exist yet
  }
}

async function upsertCache(origin: string, destination: string, price: number | null): Promise<void> {
  try {
    await query(
      `INSERT INTO flight_cache (origin_iata, destination_iata, price_usd, provider)
       VALUES ($1, $2, $3, 'serpapi')
       ON CONFLICT (origin_iata, destination_iata) DO UPDATE
         SET price_usd = EXCLUDED.price_usd, fetched_at = NOW()`,
      [origin, destination, price]
    );
  } catch {
    // ignore cache write failures
  }
}

/** Full fetch: cache → SerpAPI → mock fallback. Call for the user's own price. */
export async function getFlightPrice(
  origin: string,
  destination: string
): Promise<{ price_usd: number | null; provider: string }> {
  if (origin === destination) return { price_usd: null, provider: 'same-origin' };

  const cached = await checkCache(origin, destination);
  if (cached !== null) return { price_usd: cached, provider: 'cache' };

  const SERPAPI_KEY = process.env.SERPAPI_KEY;
  if (!SERPAPI_KEY) {
    // TODO: remove mock before production
    return { price_usd: 420, provider: 'mock' };
  }

  try {
    const outboundDate = new Date();
    outboundDate.setDate(outboundDate.getDate() + 30);
    const dateStr = outboundDate.toISOString().slice(0, 10);

    const url = new URL('https://serpapi.com/search.json');
    url.searchParams.set('engine', 'google_flights');
    url.searchParams.set('departure_id', origin);
    url.searchParams.set('arrival_id', destination);
    url.searchParams.set('outbound_date', dateStr);
    url.searchParams.set('currency', 'USD');
    url.searchParams.set('hl', 'en');
    url.searchParams.set('api_key', SERPAPI_KEY);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`SerpAPI ${res.status}`);
    const data = await res.json();
    const price: number | null =
      data.best_flights?.[0]?.price ?? data.other_flights?.[0]?.price ?? null;

    await upsertCache(origin, destination, price);
    return { price_usd: price, provider: 'serpapi' };
  } catch {
    return { price_usd: 420, provider: 'mock' };
  }
}

/**
 * Cache-only (or mock when SERPAPI_KEY absent). Use for group members to avoid
 * extra API calls beyond what we fetch for the current user.
 */
export async function getFlightPriceCacheOnly(
  origin: string,
  destination: string
): Promise<number | null> {
  if (origin === destination) return null;
  const SERPAPI_KEY = process.env.SERPAPI_KEY;
  if (!SERPAPI_KEY) return 420; // same mock for everyone
  return checkCache(origin, destination);
}
