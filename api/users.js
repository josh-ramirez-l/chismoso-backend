import { neon } from '@neondatabase/serverless';
// Force redeploy v2

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Email');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Check admin from header or query
  const adminEmail = req.headers['x-admin-email'] || req.query.adminEmail;
  if (!isAdminEmail(adminEmail)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await ensureUsersTable();

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

    const users = await sql`
      SELECT id, email, name, position, role, kpis, created_at, last_seen_at
      FROM users
      ORDER BY created_at DESC
    `;

    res.status(200).json({ users: users || [] });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}
