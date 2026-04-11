import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';

const VALID_CONTINENTS = [
  'Africa',
  'Asia',
  'Europe',
  'North America',
  'South America',
  'Oceania',
  'Antarctica',
] as const;

// GET: return current user's continent preferences
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await query('SELECT continents FROM users WHERE id = $1', [session.userId]);
  const row = result.rows[0] as { continents: string[] | null } | undefined;

  return NextResponse.json({ continents: row?.continents ?? [] });
}

// PATCH: update current user's continent preferences
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { continents } = body as { continents: string[] };

  if (!Array.isArray(continents)) {
    return NextResponse.json({ error: 'continents must be an array' }, { status: 400 });
  }

  const invalid = continents.filter(c => !(VALID_CONTINENTS as readonly string[]).includes(c));
  if (invalid.length > 0) {
    return NextResponse.json({ error: `Invalid continents: ${invalid.join(', ')}` }, { status: 400 });
  }

  await query('UPDATE users SET continents = $1 WHERE id = $2', [continents, session.userId]);

  return NextResponse.json({ ok: true });
}
