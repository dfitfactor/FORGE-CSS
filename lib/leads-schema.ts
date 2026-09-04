import { db } from '@/lib/db'

let ensureLeadsSchemaPromise: Promise<void> | null = null

export async function ensureLeadsSchema() {
  if (!ensureLeadsSchemaPromise) {
    ensureLeadsSchemaPromise = (async () => {
      await db.query(`CREATE TABLE IF NOT EXISTS leads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        aisha_lead_id TEXT UNIQUE,
        first_name TEXT,
        last_name TEXT,
        email TEXT NOT NULL,
        phone TEXT,
        company TEXT,
        source TEXT,
        status TEXT NOT NULL DEFAULT 'new',
        score INTEGER,
        notes TEXT,
        next_action TEXT,
        goal TEXT,
        raw_payload JSONB,
        aisha_synced BOOLEAN NOT NULL DEFAULT false,
        aisha_synced_at TIMESTAMPTZ,
        converted_to_client BOOLEAN NOT NULL DEFAULT false,
        client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
        converted_at TIMESTAMPTZ,
        converted_by UUID REFERENCES users(id) ON DELETE SET NULL,
        last_aisha_event TEXT,
        last_aisha_event_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`)

      await db.query(`ALTER TABLE leads
        ADD COLUMN IF NOT EXISTS aisha_lead_id TEXT,
        ADD COLUMN IF NOT EXISTS first_name TEXT,
        ADD COLUMN IF NOT EXISTS last_name TEXT,
        ADD COLUMN IF NOT EXISTS email TEXT,
        ADD COLUMN IF NOT EXISTS phone TEXT,
        ADD COLUMN IF NOT EXISTS company TEXT,
        ADD COLUMN IF NOT EXISTS source TEXT,
        ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new',
        ADD COLUMN IF NOT EXISTS score INTEGER,
        ADD COLUMN IF NOT EXISTS notes TEXT,
        ADD COLUMN IF NOT EXISTS next_action TEXT,
        ADD COLUMN IF NOT EXISTS goal TEXT,
        ADD COLUMN IF NOT EXISTS raw_payload JSONB,
        ADD COLUMN IF NOT EXISTS aisha_synced BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS aisha_synced_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS converted_to_client BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS converted_by UUID REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS last_aisha_event TEXT,
        ADD COLUMN IF NOT EXISTS last_aisha_event_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`)

      await db.query(`CREATE INDEX IF NOT EXISTS leads_status_idx ON leads(status)`)
      await db.query(`CREATE INDEX IF NOT EXISTS leads_email_idx ON leads(email)`)
      await db.query(`CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads(created_at DESC)`)
    })().catch((error) => {
      ensureLeadsSchemaPromise = null
      throw error
    })
  }

  await ensureLeadsSchemaPromise
}
