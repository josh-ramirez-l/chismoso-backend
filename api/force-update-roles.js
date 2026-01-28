import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Email');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const adminEmail = (req.headers['x-admin-email'] || '').toLowerCase();
  if (!ADMIN_EMAILS.includes(adminEmail)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Force update both emails to developer role
    await sql`UPDATE users SET role = 'developer' WHERE email = 'teaminternationalus@gmail.com'`;
    await sql`UPDATE users SET role = 'developer' WHERE email = 'jramirezteaminternational@gmail.com'`;
    
    const users = await sql`SELECT email, role FROM users ORDER BY email`;
    
    res.status(200).json({ success: true, updated: users });
  } catch (error) {
    console.error('Force update error:', error);
    res.status(500).json({ error: error.message });
  }
}
