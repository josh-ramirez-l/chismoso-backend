import { neon } from '@neondatabase/serverless';

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { adminEmail } = req.query;

  // Simple admin check
  if (!isAdminEmail(adminEmail)) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    const weeklyResult = await sql`
      SELECT * FROM weekly_checkins ORDER BY submitted_at DESC
    `;
    const monthlyResult = await sql`
      SELECT * FROM monthly_reports ORDER BY submitted_at DESC
    `;

    res.status(200).json({
      weeklyCheckins: weeklyResult.rows,
      monthlyReports: monthlyResult.rows
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}
