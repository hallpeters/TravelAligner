import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import {
  pickDestination,
  getAirportCity,
  getFlightPrice,
  getFlightPriceCacheOnly,
} from '@/lib/flightPrice';

// ---- window-computation helpers ----

type MyRange = { id: number; start_date: string; end_date: string; label: string | null };
type FriendRange = { friend_name: string; start_date: string; end_date: string };

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayCount(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && aEnd >= bStart;
}

function computeSegments(myRanges: MyRange[], friendRanges: FriendRange[]) {
  const boundarySet = new Set<string>();
  for (const r of myRanges) {
    boundarySet.add(r.start_date);
    boundarySet.add(addDays(r.end_date, 1));
  }
  for (const fr of friendRanges) {
    boundarySet.add(fr.start_date);
    boundarySet.add(addDays(fr.end_date, 1));
  }
  const boundaries = Array.from(boundarySet).sort();
  const segments: { start: string; end: string; meIn: boolean; friendsIn: Set<string> }[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = addDays(boundaries[i + 1], -1);
    const meIn = myRanges.some(r => r.start_date <= start && r.end_date >= end);
    const friendsIn = new Set(
      friendRanges
        .filter(fr => fr.start_date <= start && fr.end_date >= end)
        .map(fr => fr.friend_name)
    );
    segments.push({ start, end, meIn, friendsIn });
  }
  return segments;
}

function enumerateSpans(segments: ReturnType<typeof computeSegments>) {
  const spans: { start: string; end: string; meInAll: boolean; friends: string[] }[] = [];
  for (let i = 0; i < segments.length; i++) {
    let intersection = new Set(segments[i].friendsIn);
    let meInAll = segments[i].meIn;
    let meInAny = segments[i].meIn;
    for (let j = i; j < segments.length; j++) {
      if (j > i) {
        const next = segments[j];
        const narrowed = new Set<string>();
        for (const f of intersection) if (next.friendsIn.has(f)) narrowed.add(f);
        intersection = narrowed;
        meInAll = meInAll && next.meIn;
        meInAny = meInAny || next.meIn;
      }
      if (!meInAll && meInAny) break;
      if (intersection.size === 0) break;
      spans.push({ start: segments[i].start, end: segments[j].end, meInAll, friends: Array.from(intersection) });
    }
  }
  return spans;
}

function selectNonOverlapping(
  candidates: { start: string; end: string; friends: string[] }[]
): { start: string; end: string; friends: string[] }[] {
  const filtered = candidates
    .filter(c => c.friends.length >= 1)
    .sort((a, b) => {
      const diff = b.friends.length - a.friends.length;
      return diff !== 0 ? diff : dayCount(b.start, b.end) - dayCount(a.start, a.end);
    });
  const selected: { start: string; end: string; friends: string[] }[] = [];
  for (const c of filtered) {
    if (selected.some(s => overlaps(s.start, s.end, c.start, c.end))) continue;
    selected.push(c);
  }
  return selected;
}

// ---- types ----

export type EnrichedContinent = {
  continent: string;
  count: number;
  destination_iata: string | null;
  destination_city: string | null;
  user_price_usd: number | null;
  avg_group_price_usd: number | null; // null if <2 prices available
};

type WindowMeta = {
  topContinents: EnrichedContinent[];
  price_usd: number | null; // top-1 user price, used for sorting
  destination_iata: string | null;
  flightContinent: string | null;
};

// ---- route handler ----

export async function GET() {
  try {
    return await tripWindowsHandler();
  } catch (err) {
    console.error('trip-windows error:', err);
    return NextResponse.json(
      { myRanges: [], friendRanges: [], windowMeta: {}, userHasHomeAirport: false },
      { status: 200 } // return 200 so the client parses the JSON and shows an empty state
    );
  }
}

async function tripWindowsHandler() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const myRanges = (await query(
    'SELECT id, start_date, end_date, label FROM date_ranges WHERE user_id = $1 ORDER BY start_date',
    [session.userId]
  )).rows as MyRange[];

  const friends = (await query(`
    SELECT DISTINCT u.id, u.username FROM users u
    JOIN friendships f ON (
      (f.user_id = $1 AND f.friend_id = u.id) OR
      (f.friend_id = $1 AND f.user_id = u.id)
    )
    WHERE f.status = 'accepted' AND u.id != $1
  `, [session.userId])).rows as { id: number; username: string }[];

  // Fetch current user's home_airport and continents
  const userRow = (await query(
    'SELECT home_airport, continents FROM users WHERE id = $1',
    [session.userId]
  )).rows[0] as { home_airport: string | null; continents: string[] | null } | undefined;
  const userHomeAirport = userRow?.home_airport ?? null;
  const userContinents = userRow?.continents ?? [];

  if (friends.length === 0) {
    return NextResponse.json({
      myRanges,
      friendRanges: [],
      windowMeta: {},
      userHasHomeAirport: !!userHomeAirport,
    });
  }

  const friendIds = friends.map(f => f.id);
  const placeholders = friendIds.map((_, i) => `$${i + 1}`).join(', ');
  const friendRangesRaw = (await query(
    `SELECT user_id, start_date, end_date FROM date_ranges WHERE user_id IN (${placeholders})`,
    friendIds
  )).rows as { user_id: number; start_date: string; end_date: string }[];

  const idToName = new Map(friends.map(f => [f.id, f.username]));
  const friendRanges = friendRangesRaw.map(r => ({
    friend_name: idToName.get(r.user_id)!,
    start_date: r.start_date,
    end_date: r.end_date,
  }));

  // Fetch all friends' continents and home_airport
  const friendDataRows = (await query(
    'SELECT id, continents, home_airport FROM users WHERE id = ANY($1)',
    [friendIds]
  )).rows as { id: number; continents: string[] | null; home_airport: string | null }[];

  const nameToData = new Map<string, { continents: string[]; home_airport: string | null }>();
  for (const fr of friendDataRows) {
    const username = idToName.get(fr.id);
    if (username) {
      nameToData.set(username, { continents: fr.continents ?? [], home_airport: fr.home_airport });
    }
  }

  // Compute windows
  const segments = computeSegments(myRanges, friendRanges);
  const spans = enumerateSpans(segments);
  const greenWindows = selectNonOverlapping(spans.filter(s => s.meInAll));
  const yellowWindows = selectNonOverlapping(spans.filter(s => !s.meInAll));

  // Build initial windowMeta (continent counts only)
  const windowMeta: Record<string, WindowMeta> = {};
  for (const w of [...greenWindows, ...yellowWindows]) {
    const key = `${w.start}/${w.end}`;
    const continentCounts: Record<string, number> = {};
    for (const c of userContinents) {
      continentCounts[c] = (continentCounts[c] ?? 0) + 1;
    }
    for (const fname of w.friends) {
      for (const c of nameToData.get(fname)?.continents ?? []) {
        continentCounts[c] = (continentCounts[c] ?? 0) + 1;
      }
    }
    const topContinents: EnrichedContinent[] = Object.entries(continentCounts)
      .map(([continent, count]) => ({
        continent,
        count,
        destination_iata: null,
        destination_city: null,
        user_price_usd: null,
        avg_group_price_usd: null,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    windowMeta[key] = { topContinents, price_usd: null, destination_iata: null, flightContinent: null };
  }

  // Enrich top-5 windows with destinations and prices
  const top5 = [...greenWindows, ...yellowWindows]
    .sort((a, b) => b.friends.length - a.friends.length)
    .slice(0, 5);

  await Promise.all(
    top5.map(async (w) => {
      const key = `${w.start}/${w.end}`;
      const meta = windowMeta[key];
      if (!meta || meta.topContinents.length === 0 || !userHomeAirport) return;

      const friendAirports = w.friends
        .map(fname => nameToData.get(fname)?.home_airport)
        .filter((a): a is string => !!a);
      // Exclude all group members' airports from destination selection
      const excludeList = [...new Set([...friendAirports])];

      // Enrich each continent row
      meta.topContinents = await Promise.all(
        meta.topContinents.map(async (tc, idx) => {
          const destination = pickDestination(tc.continent, userHomeAirport, excludeList);
          const city = destination ? getAirportCity(destination) : null;

          let userPrice: number | null = null;
          if (destination) {
            if (idx === 0) {
              // Top continent: full fetch (cache → SerpAPI → mock)
              const result = await getFlightPrice(userHomeAirport, destination);
              userPrice = result.price_usd;
            } else {
              // Lower-ranked: cache/mock only, no new API calls
              userPrice = await getFlightPriceCacheOnly(userHomeAirport, destination);
            }
          }

          // Group average: user + all friends in this window
          let avgGroupPrice: number | null = null;
          if (destination) {
            const prices: number[] = [];
            if (userPrice !== null) prices.push(userPrice);
            for (const friendAirport of friendAirports) {
              const fp = await getFlightPriceCacheOnly(friendAirport, destination);
              if (fp !== null) prices.push(fp);
            }
            // Only show avg when we have prices from 2+ group members
            if (prices.length >= 2) {
              avgGroupPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
            }
          }

          return { ...tc, destination_iata: destination, destination_city: city, user_price_usd: userPrice, avg_group_price_usd: avgGroupPrice };
        })
      );

      // Top-level price for sorting = top-1 continent's user price
      const top1 = meta.topContinents[0];
      meta.price_usd = top1.user_price_usd;
      meta.destination_iata = top1.destination_iata;
      meta.flightContinent = top1.continent;
    })
  );

  return NextResponse.json({ myRanges, friendRanges, windowMeta, userHasHomeAirport: !!userHomeAirport });
}
