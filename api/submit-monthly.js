import { sql } from '@vercel/postgres';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userEmail, userName, data } = req.body;

  try {
    await sql`
      INSERT INTO monthly_reports (user_email, user_name, data, submitted_at)
      VALUES (${userEmail}, ${userName}, ${JSON.stringify(data)}, NOW())
    `;

    await resend.emails.send({
      from: 'Chismoso <onboarding@resend.dev>',
      to: process.env.ADMIN_EMAIL,
      subject: `Monthly Report: ${userName}`,
      html: `
        <h2>New Monthly Report from ${userName}</h2>
        <p><strong>Email:</strong> ${userEmail}</p>
        <p><strong>Month:</strong> ${data.monthName || 'N/A'}</p>
        <hr>
        <h3>Executive Snapshot</h3>
        <p><strong>Team:</strong> ${data.executiveSnapshot?.team || 'N/A'}</p>
        <p><strong>Business Impact:</strong> ${data.executiveSnapshot?.businessImpact || 'N/A'}</p>
        <hr>
        <pre>${JSON.stringify(data, null, 2)}</pre>
      `
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}
