import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Delete specific users for cleanup
    const emails = [
      'test@test.com',
      'jramirezteaminternational@gmail.com', 
      'teaminternationalus@gmail.com'
    ];
    
    const deleted = [];
    for (const email of emails) {
      const result = await sql`DELETE FROM users WHERE lower(email) = lower(${email}) RETURNING id, email`;
      if (result.length > 0) deleted.push(result[0]);
    }

    res.status(200).json({ success: true, deleted });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ error: error.message });
  }
}
