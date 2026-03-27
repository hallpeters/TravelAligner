import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { signToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
  }

  if (username.length < 3 || password.length < 6) {
    return NextResponse.json(
      { error: 'Username min 3 chars, password min 6 chars' },
      { status: 400 }
    );
  }

  const existing = await query('SELECT id FROM users WHERE username = $1', [username]);
  if (existing.rows[0]) {
    return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
  }

  const password_hash = await bcrypt.hash(password, 10);
  const result = await query(
    'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id',
    [username, password_hash]
  );

  const token = await signToken({ userId: result.rows[0].id as number, username });
  const response = NextResponse.json({ username });
  response.cookies.set('token', token, { httpOnly: true, maxAge: 60 * 60 * 24 * 7, path: '/' });
  return response;
}
