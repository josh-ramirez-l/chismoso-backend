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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  const { adminEmail } = req.query;

  // Prefer role-based access (Developer) via JWT; fallback to ADMIN_EMAILS for legacy.
  let authorized = false;
  const authHeader = req.headers.authorization || '';
  const token = String(authHeader).replace(/^Bearer\s+/i, '').trim();

  try {
    if (token) {
      const payload = verifyJWT(token);
      if (payload?.userId) {
        await ensureUsersTable();
        const me = await sql`SELECT id, role FROM users WHERE id = ${payload.userId}`;
        if (me.length > 0) {
          const role = String(me[0].role || '').toLowerCase();
          if (role === 'developer' || role === 'director') {
            authorized = true;
          }
        }
      }
    }
  } catch (_) {
    // ignore
  }

  if (!authorized && !isAdminEmail(adminEmail)) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    if (req.method === 'DELETE') {
      const type = String(req.query?.type || '').trim().toLowerCase();
      const id = Number(req.query?.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ error: 'Missing or invalid id' });
      }

      let deleted = null;
      if (type === 'weekly') {
        const result = await sql`DELETE FROM weekly_checkins WHERE id = ${id} RETURNING id`;
        deleted = result?.[0] || null;
      } else if (type === 'monthly') {
        const result = await sql`DELETE FROM monthly_reports WHERE id = ${id} RETURNING id`;
        deleted = result?.[0] || null;
      } else {
        return res.status(400).json({ error: 'Invalid type (expected weekly|monthly)' });
      }

      if (!deleted) {
        return res.status(404).json({ error: 'Report not found' });
      }

      return res.status(200).json({ success: true, deleted: { type, id: deleted.id } });
    }

    const weeklyResult = await sql`SELECT * FROM weekly_checkins ORDER BY submitted_at DESC`;
    const monthlyResult = await sql`SELECT * FROM monthly_reports ORDER BY submitted_at DESC`;

    res.status(200).json({
      weeklyCheckins: Array.isArray(weeklyResult) ? weeklyResult : [],
      monthlyReports: Array.isArray(monthlyResult) ? monthlyResult : []
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}
