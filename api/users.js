import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';
// Force redeploy v2

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

  // Migration safety: some older deployments created the users table without password_hash.
  try {
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)`;
  } catch (_) {
    // Non-fatal
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Email');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Chismoso-Version', 'users-v4');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Prefer role-based access (Developer) via JWT; fallback to ADMIN_EMAILS for legacy.
  let authorized = false;
  const authHeader = req.headers.authorization || '';
  const token = String(authHeader).replace(/^Bearer\s+/i, '').trim();

  try {
    if (token) {
      const payload = verifyJWT(token);
      if (payload?.userId) {
        await ensureUsersTable();
        const me = await sql`SELECT id, email, role FROM users WHERE id = ${payload.userId}`;
        if (me.length > 0) {
          const role = String(me[0].role || '').toLowerCase();
          if (role === 'developer' || role === 'director') {
            authorized = true;
          }
        }
      }
    }
  } catch (_) {
    // Ignore and fallback to env-based admin
  }

  if (!authorized) {
    const adminEmail = req.headers['x-admin-email'] || req.query.adminEmail;
    if (!isAdminEmail(adminEmail)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    // ensureUsersTable may already have been called during authorization.
    await ensureUsersTable();

    const source = String(req.query?.source || '').trim().toLowerCase();
    const onlyOnboarding = source === 'onboarding';

    // DELETE: cleanup specific users
    if (req.method === 'DELETE') {
      const emails = [
        'test@test.com',
        'newtest@test.com',
        'jramirezteaminternational@gmail.com',
        'teaminternationalus@gmail.com'
      ];
      
      const deleted = [];
      for (const email of emails) {
        const result = await sql`DELETE FROM users WHERE lower(email) = lower(${email}) RETURNING id, email`;
        if (result.length > 0) deleted.push(result[0]);
      }
      return res.status(200).json({ success: true, deleted });
    }

    // GET: list users
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const users = onlyOnboarding
      ? await sql`
          SELECT id, email, name, position, role, kpis, created_at, last_seen_at,
                 (password_hash IS NOT NULL AND password_hash <> '') AS has_password
          FROM users
          WHERE password_hash IS NOT NULL AND password_hash <> ''
          ORDER BY created_at DESC
        `
      : await sql`
          SELECT id, email, name, position, role, kpis, created_at, last_seen_at,
                 (password_hash IS NOT NULL AND password_hash <> '') AS has_password
          FROM users
          ORDER BY created_at DESC
        `;

    res.status(200).json({
      users: Array.isArray(users) ? users : [],
      meta: {
        version: 'users-v4',
        source: source || 'all'
      }
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}
