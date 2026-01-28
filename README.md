# Chismoso Backend

Backend API for Chismoso Chrome Extension

## Setup

1. Install Vercel CLI:
```bash
npm install -g vercel
```

2. Login to Vercel:
```bash
vercel login
```

3. Deploy:
```bash
vercel
```

4. For production:
```bash
vercel --prod
```

## Environment Variables

Set these in Vercel Dashboard → Project Settings → Environment Variables:

- `RESEND_API_KEY` - Get from https://resend.com/api-keys
- `ADMIN_EMAIL` - Your admin email address (single-admin mode)
- `ADMIN_EMAILS` - Optional comma-separated list of admin emails (multi-admin mode). If set, it overrides `ADMIN_EMAIL`.

## Database Setup

Run this SQL in Vercel Postgres dashboard:

```sql
CREATE TABLE weekly_checkins (
  id SERIAL PRIMARY KEY,
  user_email VARCHAR(255),
  user_name VARCHAR(255),
  data JSONB,
  submitted_at TIMESTAMP
);

CREATE TABLE monthly_reports (
  id SERIAL PRIMARY KEY,
  user_email VARCHAR(255),
  user_name VARCHAR(255),
  data JSONB,
  submitted_at TIMESTAMP
);
```

## API Endpoints

- `POST /api/submit-weekly` - Submit weekly check-in
- `POST /api/submit-monthly` - Submit monthly report
- `GET /api/get-reports?adminEmail=xxx` - Get all reports (admin only)
