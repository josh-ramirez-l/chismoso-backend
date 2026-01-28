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

async function ensureUsersTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255),
      name VARCHAR(255),
      position VARCHAR(255),
      role VARCHAR(64) DEFAULT 'user',
      kpis TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      last_seen_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // Migration safety: older tables may not have password_hash.
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
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Chismoso-Version', 'register-user-v4');

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

    // Only developers can set/change roles. Everyone else can update their profile fields only.
    let allowRoleChange = false;
    const authHeader = req.headers.authorization || '';
    const token = String(authHeader).replace(/^Bearer\s+/i, '').trim();
    if (token) {
      const payload = verifyJWT(token);
      if (payload?.userId) {
        const me = await sql`SELECT id, role FROM users WHERE id = ${payload.userId}`;
        if (me.length > 0 && String(me[0].role || '').toLowerCase() === 'developer') {
          allowRoleChange = true;
        }
      }
    }

    const safeRole = allowRoleChange ? (role || null) : null;

    // Use provided values, fall back to existing values only if not provided
    const result = await sql`
      INSERT INTO users (email, name, position, role, kpis, last_seen_at)
      VALUES (${email}, ${name || null}, ${position || null}, ${safeRole || 'user'}, ${kpis || null}, NOW())
      ON CONFLICT (email)
      DO UPDATE SET
        name = COALESCE(${name || null}, users.name),
        position = COALESCE(${position || null}, users.position),
        role = COALESCE(${safeRole}, users.role),
        kpis = COALESCE(${kpis || null}, users.kpis),
        last_seen_at = NOW()
      RETURNING id, email, name, position, role, kpis, created_at, last_seen_at
    `;

    res.status(200).json({ success: true, user: result[0] || null, meta: { version: 'register-user-v4' } });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}
