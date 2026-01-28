import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function ensureUsersTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255),
      position VARCHAR(255),
      role VARCHAR(64),
      kpis TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      last_seen_at TIMESTAMP DEFAULT NOW()
    )
  `;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    email,
    name,
    position,
    role,
    kpis
  } = req.body || {};

  if (!email) {
    return res.status(400).json({ error: 'Missing email' });
  }

  try {
    await ensureUsersTable();

    const result = await sql`
      INSERT INTO users (email, name, position, role, kpis, last_seen_at)
      VALUES (${email}, ${name || null}, ${position || null}, ${role || 'user'}, ${kpis || null}, NOW())
      ON CONFLICT (email)
      DO UPDATE SET
        name = COALESCE(EXCLUDED.name, users.name),
        position = COALESCE(EXCLUDED.position, users.position),
        role = COALESCE(EXCLUDED.role, users.role),
        kpis = COALESCE(EXCLUDED.kpis, users.kpis),
        last_seen_at = NOW()
      RETURNING id, email, name, position, role, kpis, created_at, last_seen_at
    `;

    res.status(200).json({ success: true, user: result.rows?.[0] || null });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}
