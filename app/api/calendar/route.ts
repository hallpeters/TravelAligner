import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';

// Returns a map of date -> { mine: boolean, friendCount: number, friends: string[] }
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));
  const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1));

  const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
  const endOfMonth = new Date(year, month, 0);
  const endOfMonthStr = `${year}-${String(month).padStart(2, '0')}-${String(endOfMonth.getDate()).padStart(2, '0')}`;

  // Get friend IDs (accepted friendships)
  const friendRows = (await query(
    `SELECT CASE WHEN user_id = $1 THEN friend_id ELSE user_id END as fid
     FROM friendships WHERE (user_id = $1 OR friend_id = $1) AND status = 'accepted'`,
    [session.userId]
  )).rows as { fid: number }[];
  const friendIds = friendRows.map((r) => r.fid);

  // My ranges overlapping this month
  const myRanges = (await query(
    `SELECT start_date, end_date FROM date_ranges
     WHERE user_id = $1 AND start_date <= $2 AND end_date >= $3`,
    [session.userId, endOfMonthStr, startOfMonth]
  )).rows as { start_date: string; end_date: string }[];

  // Friend ranges overlapping this month
  type FriendRange = { start_date: string; end_date: string; username: string };
  let friendRanges: FriendRange[] = [];
  if (friendIds.length > 0) {
    const placeholders = friendIds.map((_, i) => `$${i + 1}`).join(', ');
    const p1 = friendIds.length + 1;
    const p2 = friendIds.length + 2;
    friendRanges = (await query(
      `SELECT dr.start_date, dr.end_date, u.username
       FROM date_ranges dr
       JOIN users u ON u.id = dr.user_id
       WHERE dr.user_id IN (${placeholders})
         AND dr.start_date <= $${p1} AND dr.end_date >= $${p2}`,
      [...friendIds, endOfMonthStr, startOfMonth]
    )).rows as FriendRange[];
  }

  // Build day-by-day map for this month
  const dayMap: Record<string, { mine: boolean; friendCount: number; friends: string[] }> = {};

  const daysInMonth = endOfMonth.getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const mine = myRanges.some((r) => r.start_date <= dateStr && r.end_date >= dateStr);
    const matchingFriends = friendRanges.filter(
      (r) => r.start_date <= dateStr && r.end_date >= dateStr
    );
    const uniqueFriends = [...new Set(matchingFriends.map((r) => r.username))];
    dayMap[dateStr] = { mine, friendCount: uniqueFriends.length, friends: uniqueFriends };
  }

  return NextResponse.json(dayMap);
}
