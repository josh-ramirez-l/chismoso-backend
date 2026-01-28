import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Email');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  const adminEmail = (req.headers['x-admin-email'] || '').toLowerCase();
  if (!ADMIN_EMAILS.includes(adminEmail)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const result = await sql`DELETE FROM users WHERE lower(email) = lower(${email}) RETURNING id, email`;
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({ success: true, deleted: result[0] });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: error.message });
  }
}
