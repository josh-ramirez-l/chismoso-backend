import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const JWT_SECRET = process.env.JWT_SECRET || 'chismoso-secret-change-me';

function hashPassword(password) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(password + JWT_SECRET).digest('hex');
}

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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const payload = verifyJWT(token);
  if (!payload || !payload.userId) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const { name, position, kpis, currentPassword, newPassword } = req.body || {};

  try {
    // Build dynamic update
    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = $' + (values.length + 1));
      values.push(name);
    }
    if (position !== undefined) {
      updates.push('position = $' + (values.length + 1));
      values.push(position);
    }
    if (kpis !== undefined) {
      updates.push('kpis = $' + (values.length + 1));
      values.push(kpis);
    }

    // Password change requires current password verification
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password required to change password' });
      }

      const userResult = await sql`SELECT password_hash FROM users WHERE id = ${payload.userId}`;
      if (userResult.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const currentHash = hashPassword(currentPassword);
      if (userResult[0].password_hash !== currentHash) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      updates.push('password_hash = $' + (values.length + 1));
      values.push(hashPassword(newPassword));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('last_seen_at = NOW()');

    // Use tagged template for the update
    const result = await sql`
      UPDATE users
      SET name = COALESCE(${name}, name),
          position = COALESCE(${position}, position),
          kpis = COALESCE(${kpis}, kpis),
          last_seen_at = NOW()
      WHERE id = ${payload.userId}
      RETURNING id, email, name, position, role, kpis
    `;

    if (result.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result[0];

    res.status(200).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        position: user.position,
        role: user.role,
        kpis: user.kpis
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: error.message });
  }
}
