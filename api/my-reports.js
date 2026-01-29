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

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    return payload;
  } catch (e) {
    return null;
  }
}

async function ensureTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS weekly_checkins (
      id SERIAL PRIMARY KEY,
      user_email VARCHAR(255),
      user_name VARCHAR(255),
      data JSONB,
      submitted_at TIMESTAMP DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS monthly_reports (
      id SERIAL PRIMARY KEY,
      user_email VARCHAR(255),
      user_name VARCHAR(255),
      data JSONB,
      submitted_at TIMESTAMP DEFAULT NOW()
    )
  `;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const payload = verifyJWT(token);
  if (!payload || !payload.email) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const userEmail = payload.email;

  try {
    await ensureTables();

    const weeklyResult = await sql`
      SELECT id, user_email, user_name, data, submitted_at
      FROM weekly_checkins
      WHERE lower(user_email) = lower(${userEmail})
      ORDER BY submitted_at DESC
      LIMIT 100
    `;

    const monthlyResult = await sql`
      SELECT id, user_email, user_name, data, submitted_at
      FROM monthly_reports
      WHERE lower(user_email) = lower(${userEmail})
      ORDER BY submitted_at DESC
      LIMIT 100
    `;

    res.status(200).json({
      weeklyCheckins: weeklyResult.map(row => ({
        ...row.data,
        id: row.id,
        serverId: row.id,
        clientId: row.data?.id || null,
        userEmail: row.user_email,
        userName: row.user_name,
        submittedAt: row.submitted_at,
        submitted: true
      })),
      monthlyReports: monthlyResult.map(row => ({
        ...row.data,
        id: row.id,
        serverId: row.id,
        clientId: row.data?.id || null,
        userEmail: row.user_email,
        userName: row.user_name,
        submittedAt: row.submitted_at,
        submitted: true
      }))
    });
  } catch (error) {
    console.error('My reports error:', error);
    res.status(500).json({ error: error.message });
  }
}
