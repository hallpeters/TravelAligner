import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';

// ---- window-computation helpers (server-side, mirrors TripWindowsPanel algorithm) ----

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

// ---- route handler ----

type WindowMeta = {
  topContinents: { continent: string; count: number }[];
  price_usd: number | null;
  destination_iata: string | null;
  flightContinent: string | null;
};

export async function GET() {
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

  if (friends.length === 0) {
    const earlyUserRow = (await query(
      'SELECT home_airport FROM users WHERE id = $1',
      [session.userId]
    )).rows[0] as { home_airport: string | null } | undefined;
    return NextResponse.json({
      myRanges,
      friendRanges: [],
      windowMeta: {},
      userHasHomeAirport: !!earlyUserRow?.home_airport,
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

  // Fetch current user's home_airport and continents
  const userRow = (await query(
    'SELECT home_airport, continents FROM users WHERE id = $1',
    [session.userId]
  )).rows[0] as { home_airport: string | null; continents: string[] | null } | undefined;
  const userHomeAirport = userRow?.home_airport ?? null;
  const userContinents = userRow?.continents ?? [];

  // Fetch all friends' continents and home_airport in one query
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

  // Compute actionable windows
  const segments = computeSegments(myRanges, friendRanges);
  const spans = enumerateSpans(segments);
  const greenWindows = selectNonOverlapping(spans.filter(s => s.meInAll));
  const yellowWindows = selectNonOverlapping(spans.filter(s => !s.meInAll));

  // Build windowMeta for all green+yellow windows
  const windowMeta: Record<string, WindowMeta> = {};
  for (const w of [...greenWindows, ...yellowWindows]) {
    const key = `${w.start}/${w.end}`;
    const continentCounts: Record<string, number> = {};
    // Include current user's own continent preferences
    for (const c of userContinents) {
      continentCounts[c] = (continentCounts[c] ?? 0) + 1;
    }
    // Include friends' continent preferences
    for (const fname of w.friends) {
      for (const c of nameToData.get(fname)?.continents ?? []) {
        continentCounts[c] = (continentCounts[c] ?? 0) + 1;
      }
    }
    const topContinents = Object.entries(continentCounts)
      .map(([continent, count]) => ({ continent, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    windowMeta[key] = { topContinents, price_usd: null, destination_iata: null, flightContinent: null };
  }

  // Fetch flight prices for top 5 windows by friend count
  const top5 = [...greenWindows, ...yellowWindows]
    .sort((a, b) => b.friends.length - a.friends.length)
    .slice(0, 5);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  await Promise.all(
    top5.map(async (w) => {
      const key = `${w.start}/${w.end}`;
      const meta = windowMeta[key];
      if (!meta || meta.topContinents.length === 0 || !userHomeAirport) return;

      const topContinent = meta.topContinents[0].continent;
      const friendHomeAirports = w.friends
        .map(fname => nameToData.get(fname)?.home_airport)
        .filter((a): a is string => !!a);
      const exclude = [...new Set(friendHomeAirports)].join(',');

      try {
        const res = await fetch(
          `${appUrl}/api/flights?continent=${encodeURIComponent(topContinent)}&origin=${encodeURIComponent(userHomeAirport)}&exclude=${encodeURIComponent(exclude)}`
        );
        const data = await res.json();
        meta.price_usd = typeof data.price_usd === 'number' ? data.price_usd : null;
        meta.destination_iata = data.destination_iata ?? null;
        meta.flightContinent = topContinent;
      } catch {
        // leave as null
      }
    })
  );

  return NextResponse.json({ myRanges, friendRanges, windowMeta, userHasHomeAirport: !!userHomeAirport });
}
