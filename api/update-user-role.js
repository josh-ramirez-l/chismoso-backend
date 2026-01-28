import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';

const sql = neon(process.env.DATABASE_URL);
const JWT_SECRET = process.env.JWT_SECRET || 'chismoso-secret-change-me';

function verifyJWT(token) {
  try {
    const [headerB64, payloadB64, signature] = token.split('.');
    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');
    if (signature !== expectedSig) return null;
    return JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
  } catch (_) {
    return null;
  }
}

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
      password_hash VARCHAR(255),
      name VARCHAR(255),
      position VARCHAR(255),
      role VARCHAR(64),
      kpis TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      last_seen_at TIMESTAMP DEFAULT NOW()
    )
  `;

  try {
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)`;
  } catch (_) {
    // Non-fatal
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { adminEmail, userId, email, role } = req.body || {};

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

    // Prefer role-based access (Developer) via JWT; fallback to ADMIN_EMAILS for legacy.
    let authorized = false;
    const authHeader = req.headers.authorization || '';
    const token = String(authHeader).replace(/^Bearer\s+/i, '').trim();
    if (token) {
      const payload = verifyJWT(token);
      if (payload?.userId) {
        const me = await sql`SELECT id, role FROM users WHERE id = ${payload.userId}`;
        if (me.length > 0 && String(me[0].role || '').toLowerCase() === 'developer') {
          authorized = true;
        }
      }
    }

    if (!authorized && !isAdminEmail(adminEmail)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

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

    const row = Array.isArray(updated) ? (updated[0] || null) : null;
    if (!row) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({ success: true, user: row });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}
