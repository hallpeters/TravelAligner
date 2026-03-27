import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ranges = (await query(
    'SELECT * FROM date_ranges WHERE user_id = $1 ORDER BY start_date',
    [session.userId]
  )).rows as { id: number; user_id: number; start_date: string; end_date: string; label: string | null }[];

  const friends = (await query(`
    SELECT DISTINCT u.id, u.username FROM users u
    JOIN friendships f ON (
      (f.user_id = $1 AND f.friend_id = u.id) OR
      (f.friend_id = $1 AND f.user_id = u.id)
    )
    WHERE f.status = 'accepted' AND u.id != $1
  `, [session.userId])).rows as { id: number; username: string }[];

  if (friends.length === 0 || ranges.length === 0) {
    return NextResponse.json(ranges.map(r => ({ ...r, overlappingFriends: [] })));
  }

  const friendIds = friends.map(f => f.id);
  const placeholders = friendIds.map((_, i) => `$${i + 1}`).join(', ');
  const friendRanges = (await query(
    `SELECT user_id, start_date, end_date FROM date_ranges WHERE user_id IN (${placeholders})`,
    friendIds
  )).rows as { user_id: number; start_date: string; end_date: string }[];

  const result = ranges.map(r => {
    const overlappingIds = new Set<number>();
    for (const fr of friendRanges) {
      if (fr.start_date <= r.end_date && fr.end_date >= r.start_date) {
        overlappingIds.add(fr.user_id);
      }
    }
    const overlappingFriends = friends.filter(f => overlappingIds.has(f.id)).slice(0, 2).map(f => f.username);
    return { ...r, overlappingFriends };
  });

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { start_date, end_date, label } = await req.json();
  if (!start_date || !end_date)
    return NextResponse.json({ error: 'start_date and end_date required' }, { status: 400 });
  if (start_date > end_date)
    return NextResponse.json({ error: 'start_date must be before end_date' }, { status: 400 });

  const result = await query(
    'INSERT INTO date_ranges (user_id, start_date, end_date, label) VALUES ($1, $2, $3, $4) RETURNING id',
    [session.userId, start_date, end_date, label || null]
  );

  return NextResponse.json({ id: result.rows[0].id, start_date, end_date, label });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, start_date, end_date, label } = await req.json();
  if (!id || !start_date || !end_date)
    return NextResponse.json({ error: 'id, start_date and end_date required' }, { status: 400 });
  if (start_date > end_date)
    return NextResponse.json({ error: 'start_date must be before end_date' }, { status: 400 });

  await query(
    'UPDATE date_ranges SET start_date = $1, end_date = $2, label = $3 WHERE id = $4 AND user_id = $5',
    [start_date, end_date, label || null, id, session.userId]
  );

  return NextResponse.json({ id, start_date, end_date, label });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  await query('DELETE FROM date_ranges WHERE id = $1 AND user_id = $2', [id, session.userId]);
  return NextResponse.json({ ok: true });
}
