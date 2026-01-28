import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const JWT_SECRET = process.env.JWT_SECRET || 'chismoso-secret-change-me';

function verifyJWT(token) {
  try {
    const [headerB64, payloadB64, signature] = token.split('.');
    const crypto = require('crypto');
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
  if (!payload || !payload.userId) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const result = await sql`
      SELECT id, email, name, position, role, kpis, created_at, last_seen_at
      FROM users
      WHERE id = ${payload.userId}
    `;

    if (result.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result[0];

    // Update last_seen_at
    await sql`UPDATE users SET last_seen_at = NOW() WHERE id = ${user.id}`;

    res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        position: user.position,
        role: user.role,
        kpis: user.kpis,
        createdAt: user.created_at,
        lastSeenAt: user.last_seen_at
      }
    });
  } catch (error) {
    console.error('Me error:', error);
    res.status(500).json({ error: error.message });
  }
}
