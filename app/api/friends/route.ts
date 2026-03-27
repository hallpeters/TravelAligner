import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';

// GET: list friends (accepted)
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const friends = (await query(
    `SELECT u.id, u.username FROM users u
     JOIN friendships f ON (f.friend_id = u.id AND f.user_id = $1 AND f.status = 'accepted')
                        OR (f.user_id = u.id AND f.friend_id = $1 AND f.status = 'accepted')`,
    [session.userId]
  )).rows as { id: number; username: string }[];

  const incoming = (await query(
    `SELECT u.id, u.username FROM users u
     JOIN friendships f ON f.user_id = u.id AND f.friend_id = $1 AND f.status = 'pending'`,
    [session.userId]
  )).rows as { id: number; username: string }[];

  const outgoing = (await query(
    `SELECT u.id, u.username FROM users u
     JOIN friendships f ON f.friend_id = u.id AND f.user_id = $1 AND f.status = 'pending'`,
    [session.userId]
  )).rows as { id: number; username: string }[];

  return NextResponse.json({ friends, incoming, outgoing });
}

// POST: send friend request
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { username } = await req.json();

  const targetResult = await query('SELECT id FROM users WHERE username = $1', [username]);
  const target = targetResult.rows[0] as { id: number } | undefined;

  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (target.id === session.userId)
    return NextResponse.json({ error: 'Cannot add yourself' }, { status: 400 });

  const existingResult = await query(
    `SELECT id, status FROM friendships WHERE
     (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`,
    [session.userId, target.id]
  );
  const existing = existingResult.rows[0] as { id: number; status: string } | undefined;

  if (existing) {
    if (existing.status === 'accepted')
      return NextResponse.json({ error: 'Already friends' }, { status: 409 });

    // If they sent us a request, accept it
    const theirRequestResult = await query(
      `SELECT id FROM friendships WHERE user_id = $1 AND friend_id = $2 AND status = 'pending'`,
      [target.id, session.userId]
    );
    const theirRequest = theirRequestResult.rows[0];
    if (theirRequest) {
      await query(`UPDATE friendships SET status = 'accepted' WHERE id = $1`, [
        (theirRequest as { id: number }).id,
      ]);
      return NextResponse.json({ status: 'accepted' });
    }
    return NextResponse.json({ error: 'Request already sent' }, { status: 409 });
  }

  await query('INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, $3)', [
    session.userId,
    target.id,
    'pending',
  ]);

  return NextResponse.json({ status: 'pending' });
}

// PATCH: accept friend request
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { fromUserId } = await req.json();

  await query(
    `UPDATE friendships SET status = 'accepted' WHERE user_id = $1 AND friend_id = $2 AND status = 'pending'`,
    [fromUserId, session.userId]
  );

  return NextResponse.json({ ok: true });
}

// DELETE: remove friend
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { friendId } = await req.json();

  await query(
    `DELETE FROM friendships WHERE
     (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`,
    [session.userId, friendId]
  );

  return NextResponse.json({ ok: true });
}
