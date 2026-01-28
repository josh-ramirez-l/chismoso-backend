import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';

const sql = neon(process.env.DATABASE_URL);
const JWT_SECRET = process.env.JWT_SECRET || 'chismoso-secret-change-me';

// Simple JWT implementation (no external deps)
function base64url(str) {
  return Buffer.from(str).toString('base64url');
}

function createJWT(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify({ ...payload, iat: Date.now() }));
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');
  return `${headerB64}.${payloadB64}.${signature}`;
}

// Simple password hashing (for demo; use bcrypt in production)
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + JWT_SECRET).digest('hex');
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
  // Add password_hash column if missing (migration for existing tables)
  try {
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)`;
  } catch (e) {
    // Column may already exist
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password, name, position, kpis } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    await ensureUsersTable();

    // Check if user already exists
    const existing = await sql`SELECT id FROM users WHERE lower(email) = lower(${email})`;
    if (existing.length > 0) {
      return res.status(409).json({ error: 'User already exists. Please login.' });
    }

    const passwordHash = hashPassword(password);

    const result = await sql`
      INSERT INTO users (email, password_hash, name, position, role, kpis, last_seen_at)
      VALUES (${email}, ${passwordHash}, ${name || null}, ${position || null}, 'user', ${kpis || null}, NOW())
      RETURNING id, email, name, position, role, kpis, created_at
    `;

    const user = result[0];
    const token = createJWT({ userId: user.id, email: user.email, role: user.role });

    res.status(201).json({
      success: true,
      token,
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
    console.error('Register error:', error);
    res.status(500).json({ error: error.message });
  }
}
