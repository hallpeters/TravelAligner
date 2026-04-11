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
    return NextResponse.json({ myRanges, friendRanges: [], windowPrices: {} });
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

  // Compute actionable windows to determine which ones get price lookups
  const segments = computeSegments(myRanges, friendRanges);
  const spans = enumerateSpans(segments);
  const greenWindows = selectNonOverlapping(spans.filter(s => s.meInAll));
  const yellowWindows = selectNonOverlapping(spans.filter(s => !s.meInAll));

  // Top 5 by friend count across green + yellow
  const top5 = [...greenWindows, ...yellowWindows]
    .sort((a, b) => b.friends.length - a.friends.length)
    .slice(0, 5);

  // Fetch prices in parallel
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const windowPrices: Record<string, number | null> = {};

  await Promise.all(
    top5.map(async (w) => {
      try {
        const res = await fetch(`${appUrl}/api/flights?start=${w.start}&end=${w.end}`);
        const data = await res.json();
        windowPrices[`${w.start}/${w.end}`] = typeof data.price_usd === 'number' ? data.price_usd : null;
      } catch {
        windowPrices[`${w.start}/${w.end}`] = null;
      }
    })
  );

  return NextResponse.json({ myRanges, friendRanges, windowPrices });
}
