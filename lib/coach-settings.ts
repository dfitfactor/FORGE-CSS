import { db } from '@/lib/db'

export type CoachSettingsColumnSupport = {
  avatarUrl: boolean
  timezone: boolean
  notificationEmail: boolean
  updatedAt: boolean
}

export async function ensureCoachSettingsColumns() {
  try {
    await db.query(`ALTER TABLE users
      ADD COLUMN IF NOT EXISTS avatar_url TEXT,
      ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/New_York',
      ADD COLUMN IF NOT EXISTS notification_email TEXT,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`)

    await db.query(`UPDATE users
      SET notification_email = email
      WHERE notification_email IS NULL`)
  } catch (err) {
    console.warn('[coach-settings] ensureCoachSettingsColumns skipped:', err)
  }
}

export async function getCoachSettingsColumnSupport(): Promise<CoachSettingsColumnSupport> {
  const rows = await db.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'users'
       AND column_name IN ('avatar_url', 'timezone', 'notification_email', 'updated_at')`
  )

  const columns = new Set(rows.map((row) => row.column_name))

  return {
    avatarUrl: columns.has('avatar_url'),
    timezone: columns.has('timezone'),
    notificationEmail: columns.has('notification_email'),
    updatedAt: columns.has('updated_at'),
  }
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
  const columns = await getCoachSettingsColumnSupport()

  const coach = await db.queryOne<{
    id: string
    email: string
    notification_email: string | null
    timezone: string | null
  }>(
    `SELECT id,
            email,
            ${columns.notificationEmail ? 'notification_email' : 'NULL::text AS notification_email'},
            ${columns.timezone ? 'timezone' : "NULL::text AS timezone"}
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
