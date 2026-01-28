import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

function isAdminEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return false;

  const list = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (list.length > 0) return list.includes(normalized);

  const single = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  return !!single && single === normalized;
}

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

  const { adminEmail, userId, email, role } = req.body || {};

  if (!isAdminEmail(adminEmail)) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const nextRole = String(role || '').trim().toLowerCase();
  const allowed = new Set(['user', 'director', 'developer']);
  if (!allowed.has(nextRole)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  if (!userId && !email) {
    return res.status(400).json({ error: 'Missing userId or email' });
  }

  try {
    await ensureUsersTable();

    const updated = userId
      ? await sql`
          UPDATE users
          SET role = ${nextRole}
          WHERE id = ${Number(userId)}
          RETURNING id, email, name, position, role, kpis, created_at, last_seen_at
        `
      : await sql`
          UPDATE users
          SET role = ${nextRole}
          WHERE lower(email) = lower(${String(email)})
          RETURNING id, email, name, position, role, kpis, created_at, last_seen_at
        `;

    const row = updated.rows?.[0] || null;
    if (!row) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({ success: true, user: row });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}
