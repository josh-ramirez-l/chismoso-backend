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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth: only Developer role
  const authHeader = req.headers.authorization || '';
  const token = String(authHeader).replace(/^Bearer\s+/i, '').trim();
  let authorized = false;
  if (token) {
    const payload = verifyJWT(token);
    if (payload?.userId) {
      const me = await sql`SELECT id, role FROM users WHERE id = ${payload.userId}`;
      if (me.length > 0 && String(me[0].role || '').toLowerCase() === 'developer') {
        authorized = true;
      }
    }
  }
  if (!authorized) return res.status(403).json({ error: 'Unauthorized' });

  // Only keep Josh and TEAM
  const keepEmails = [
    'jramirezteaminternational@gmail.com',
    'teaminternationalus@gmail.com'
  ];
  try {
    const deleted = await sql`
      DELETE FROM users WHERE email NOT IN (${keepEmails}) RETURNING id, email
    `;
    res.status(200).json({ success: true, deleted });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
