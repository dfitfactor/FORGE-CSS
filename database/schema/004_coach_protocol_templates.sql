ALTER TABLE users
  ADD COLUMN IF NOT EXISTS settings_json JSONB DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS coach_protocol_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_type VARCHAR(50) NOT NULL CHECK (template_type IN ('movement', 'nutrition', 'habit_coaching')),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  template_text TEXT NOT NULL,
  template_payload JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coach_protocol_templates_owner_type
  ON coach_protocol_templates(coach_id, template_type, is_active, sort_order, created_at DESC);

DROP TRIGGER IF EXISTS update_coach_protocol_templates_updated_at ON coach_protocol_templates;
CREATE TRIGGER update_coach_protocol_templates_updated_at
  BEFORE UPDATE ON coach_protocol_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
