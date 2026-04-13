CREATE TABLE IF NOT EXISTS leads (
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
);

CREATE INDEX IF NOT EXISTS leads_status_idx ON leads(status);
CREATE INDEX IF NOT EXISTS leads_email_idx ON leads(email);
CREATE INDEX IF NOT EXISTS leads_aisha_lead_id_idx ON leads(aisha_lead_id);
CREATE INDEX IF NOT EXISTS leads_converted_to_client_idx ON leads(converted_to_client);
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads(created_at DESC);

DROP TRIGGER IF EXISTS update_leads_updated_at ON leads;
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
