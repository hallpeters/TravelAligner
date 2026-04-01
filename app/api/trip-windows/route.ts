import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const myRanges = (await query(
    'SELECT id, start_date, end_date, label FROM date_ranges WHERE user_id = $1 ORDER BY start_date',
    [session.userId]
  )).rows as { id: number; start_date: string; end_date: string; label: string | null }[];

  const friends = (await query(`
    SELECT DISTINCT u.id, u.username FROM users u
    JOIN friendships f ON (
      (f.user_id = $1 AND f.friend_id = u.id) OR
      (f.friend_id = $1 AND f.user_id = u.id)
    )
    WHERE f.status = 'accepted' AND u.id != $1
  `, [session.userId])).rows as { id: number; username: string }[];

  if (friends.length === 0) {
    return NextResponse.json({ myRanges, friendRanges: [] });
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

  return NextResponse.json({ myRanges, friendRanges });
}
