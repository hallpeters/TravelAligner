import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const query = (text: string, params?: unknown[]) => pool.query(text, params as unknown[]);

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      continents TEXT[] DEFAULT '{}',
      created_at TEXT DEFAULT NOW()::TEXT
    );

    CREATE TABLE IF NOT EXISTS friendships (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      friend_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT NOW()::TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (friend_id) REFERENCES users(id),
      UNIQUE(user_id, friend_id)
    );

    CREATE TABLE IF NOT EXISTS date_ranges (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      label TEXT,
      created_at TEXT DEFAULT NOW()::TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS flight_cache (
      id SERIAL PRIMARY KEY,
      origin_iata TEXT NOT NULL,
      destination_iata TEXT NOT NULL,
      price_usd INTEGER,
      provider TEXT,
      fetched_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(origin_iata, destination_iata)
    );
  `);

  // Column migrations — safe to re-run
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS continents TEXT[] DEFAULT '{}'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS home_airport TEXT`);
}

initDb().catch(console.error);
