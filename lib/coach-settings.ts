import { db } from '@/lib/db'

export async function ensureCoachSettingsColumns() {
  await db.query(`ALTER TABLE users
    ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/New_York',
    ADD COLUMN IF NOT EXISTS notification_email TEXT`)

  await db.query(`UPDATE users
    SET notification_email = email
    WHERE notification_email IS NULL`)
}

export async function ensureCoachTemplatesTable() {
  await db.query(`CREATE TABLE IF NOT EXISTS coach_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coach_id UUID REFERENCES users(id),
    name TEXT NOT NULL,
    template_type TEXT NOT NULL,
    content JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`)
}

export async function getCoachSettings() {
  await ensureCoachSettingsColumns()

  const coach = await db.queryOne<{
    id: string
    email: string
    notification_email: string | null
    timezone: string | null
  }>(
    `SELECT id,
            email,
            notification_email,
            timezone
     FROM users
     WHERE role IN ('coach', 'admin')
       AND is_active = true
     ORDER BY CASE WHEN lower(email) = 'coach@dfitfactor.com' THEN 0 ELSE 1 END,
              CASE WHEN role = 'admin' THEN 0 ELSE 1 END,
              created_at ASC
     LIMIT 1`
  )

  return {
    coachId: coach?.id ?? null,
    coachEmail: coach?.notification_email || coach?.email || 'coach@dfitfactor.com',
    timezone: coach?.timezone || 'America/New_York',
  }
}
