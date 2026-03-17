-- ============================================================
-- FORGË CSS — COMPLETE DATABASE SCHEMA
-- Behavioral Intelligence Platform
-- Version: 1.0.0
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS & AUTHENTICATION
-- ============================================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'coach' CHECK (role IN ('admin', 'coach', 'client')),
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CLIENT RECORDS
-- ============================================================

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- linked portal user (optional)
  coach_id UUID NOT NULL REFERENCES users(id),
  
  -- Identity
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  date_of_birth DATE,
  gender VARCHAR(50),
  
  -- Intake
  intake_date DATE NOT NULL DEFAULT CURRENT_DATE,
  primary_goal TEXT,
  secondary_goals TEXT[],
  motivation TEXT,
  obstacles TEXT,
  current_activity_level VARCHAR(100),
  fitness_experience VARCHAR(100),
  
  -- Physical baseline
  height_in DECIMAL(5,2),
  weight_lbs DECIMAL(6,2),
  body_fat_pct DECIMAL(5,2),
  
  -- Medical
  injuries TEXT[],
  medical_conditions TEXT[],
  medications TEXT[],
  physician_clearance BOOLEAN DEFAULT false,
  
  -- Program enrollment
  program_tier VARCHAR(50) CHECK (program_tier IN ('forge_lite', 'forge_core', 'forge_elite')),
  sessions_per_month INTEGER,
  
  -- Status
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'graduated', 'churned', 'prospect')),
  
  -- FORGE Stage
  current_stage VARCHAR(50) DEFAULT 'foundations' CHECK (current_stage IN (
    'foundations', 'optimization', 'resilience', 'growth', 'empowerment'
  )),
  stage_entered_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Metadata
  tags TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT client_isolation CHECK (true)  -- Row-level security enforced via RLS policies
);

-- Row Level Security for client isolation
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY clients_coach_isolation ON clients
  USING (coach_id = current_setting('app.current_user_id')::UUID 
         OR current_setting('app.current_user_role') = 'admin');

-- ============================================================
-- BEHAVIORAL INTELLIGENCE VARIABLES
-- ============================================================

CREATE TABLE behavioral_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  snapshot_week INTEGER,  -- ISO week number
  
  -- Six Core BIE Variables (0-100 scale)
  bar DECIMAL(5,2) CHECK (bar BETWEEN 0 AND 100),  -- Behavioral Adherence Rate
  bli DECIMAL(5,2) CHECK (bli BETWEEN 0 AND 100),  -- Behavioral Load Index
  dbi DECIMAL(5,2) CHECK (dbi BETWEEN 0 AND 100),  -- Decision Burden Index
  cdi DECIMAL(5,2) CHECK (cdi BETWEEN 0 AND 100),  -- Cognitive Demand Index
  lsi DECIMAL(5,2) CHECK (lsi BETWEEN 0 AND 100),  -- Lifestyle Stability Index
  c_lsi DECIMAL(5,2) CHECK (c_lsi BETWEEN 0 AND 100),  -- Composite LSI
  pps DECIMAL(5,2) CHECK (pps BETWEEN 0 AND 100),  -- Progression Probability Score
  
  -- Derived generation state (A-E)
  generation_state CHAR(1) CHECK (generation_state IN ('A','B','C','D','E')),
  generation_state_label VARCHAR(100),
  
  -- Signal sources
  computed_from VARCHAR(100)[],  -- ['journal', 'adherence', 'check_in', 'manual']
  
  -- Coach override
  coach_override BOOLEAN DEFAULT false,
  override_notes TEXT,
  
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_behavioral_snapshots_client_date ON behavioral_snapshots(client_id, snapshot_date DESC);

-- ============================================================
-- FORGE STAGE PROGRESSION
-- ============================================================

CREATE TABLE stage_progressions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  
  from_stage VARCHAR(50),
  to_stage VARCHAR(50) NOT NULL,
  direction VARCHAR(20) NOT NULL CHECK (direction IN ('advance', 'regress', 'initialize')),
  
  -- Criteria met at time of transition
  bar_at_transition DECIMAL(5,2),
  pps_at_transition DECIMAL(5,2),
  weeks_in_prior_stage INTEGER,
  
  -- Authorization
  triggered_by VARCHAR(50) CHECK (triggered_by IN ('engine', 'coach', 'auto')),
  authorized_by UUID REFERENCES users(id),
  rationale TEXT,
  
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PROTOCOLS (VERSIONED)
-- ============================================================

CREATE TABLE protocols (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  
  -- Version control — NEVER overwrite, always create new version
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  superseded_by UUID REFERENCES protocols(id),
  superseded_at TIMESTAMPTZ,
  
  -- Identity
  name VARCHAR(255) NOT NULL,
  protocol_type VARCHAR(100) NOT NULL CHECK (protocol_type IN (
    'movement', 'nutrition', 'recovery', 'accountability', 'composite'
  )),
  
  -- Context at generation time
  stage VARCHAR(50) NOT NULL,
  generation_state CHAR(1),
  bar_at_generation DECIMAL(5,2),
  bli_at_generation DECIMAL(5,2),
  dbi_at_generation DECIMAL(5,2),
  
  -- Movement protocol fields
  movement_template VARCHAR(100),
  session_frequency INTEGER,
  sessions_per_week INTEGER,
  complexity_ceiling INTEGER,
  volume_target VARCHAR(50),
  
  -- Movement blocks (JSON)
  activation_block JSONB,
  primary_block JSONB,
  accessory_block JSONB,
  finisher_block JSONB,
  
  -- Nutrition protocol fields
  calorie_target INTEGER,
  protein_target_g INTEGER,
  carb_target_g INTEGER,
  fat_target_g INTEGER,
  meal_frequency INTEGER,
  nutrition_complexity VARCHAR(50),
  
  -- Full protocol payload
  protocol_payload JSONB NOT NULL DEFAULT '{}',
  
  -- Generation metadata
  generated_by VARCHAR(50) CHECK (generated_by IN ('ai', 'coach', 'engine', 'template')),
  generated_by_user UUID REFERENCES users(id),
  ai_model_version VARCHAR(100),
  generation_prompt_version VARCHAR(50),
  
  -- Lifecycle
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expiry_date DATE,
  
  notes TEXT,
  coach_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_protocols_client_version ON protocols(client_id, protocol_type, version);
CREATE INDEX idx_protocols_client_active ON protocols(client_id, is_active, protocol_type);

-- Protocol change log (immutable audit trail)
CREATE TABLE protocol_change_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  protocol_id UUID NOT NULL REFERENCES protocols(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  action VARCHAR(50) NOT NULL CHECK (action IN ('created', 'activated', 'superseded', 'expired', 'coach_modified')),
  performed_by UUID REFERENCES users(id),
  change_summary TEXT,
  payload_diff JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ADHERENCE TRACKING
-- ============================================================

CREATE TABLE adherence_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  protocol_id UUID REFERENCES protocols(id),
  
  record_date DATE NOT NULL DEFAULT CURRENT_DATE,
  record_type VARCHAR(50) NOT NULL CHECK (record_type IN (
    'session_completed', 'session_missed', 'session_partial',
    'nutrition_logged', 'nutrition_missed',
    'check_in_completed', 'habit_logged', 'custom'
  )),
  
  -- Session specifics
  session_type VARCHAR(100),
  planned_duration_min INTEGER,
  actual_duration_min INTEGER,
  completion_pct DECIMAL(5,2),
  
  -- Effort & experience
  rpe INTEGER CHECK (rpe BETWEEN 1 AND 10),
  energy_level INTEGER CHECK (energy_level BETWEEN 1 AND 5),
  mood_rating INTEGER CHECK (mood_rating BETWEEN 1 AND 5),
  
  -- Swap tracking
  swaps_applied BOOLEAN DEFAULT false,
  swap_reasons TEXT[],
  
  -- Notes
  client_notes TEXT,
  coach_notes TEXT,
  
  -- BAR impact
  contributes_to_bar BOOLEAN DEFAULT true,
  bar_weight DECIMAL(3,2) DEFAULT 1.0,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_adherence_client_date ON adherence_records(client_id, record_date DESC);

-- Weekly BAR computed table
CREATE TABLE bar_weekly_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  
  planned_sessions INTEGER DEFAULT 0,
  completed_sessions INTEGER DEFAULT 0,
  partial_sessions INTEGER DEFAULT 0,
  missed_sessions INTEGER DEFAULT 0,
  
  planned_nutrition_days INTEGER DEFAULT 0,
  logged_nutrition_days INTEGER DEFAULT 0,
  
  check_ins_completed INTEGER DEFAULT 0,
  check_ins_planned INTEGER DEFAULT 0,
  
  computed_bar DECIMAL(5,2),
  bar_trend VARCHAR(20) CHECK (bar_trend IN ('improving', 'stable', 'declining')),
  
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, week_start)
);

-- ============================================================
-- BIOMARKERS & LAB TRACKING
-- ============================================================

CREATE TABLE biomarker_panels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  
  panel_date DATE NOT NULL,
  panel_type VARCHAR(100) NOT NULL,  -- 'comprehensive_metabolic', 'lipid', 'thyroid', 'hormone', 'custom'
  lab_name VARCHAR(255),
  ordered_by VARCHAR(255),
  
  -- Physical metrics
  weight_lbs DECIMAL(6,2),
  body_fat_pct DECIMAL(5,2),
  lean_mass_lbs DECIMAL(6,2),
  waist_in DECIMAL(5,2),
  hip_in DECIMAL(5,2),
  
  -- Metabolic
  fasting_glucose DECIMAL(6,2),
  hba1c DECIMAL(5,2),
  insulin DECIMAL(6,2),
  triglycerides DECIMAL(6,2),
  hdl DECIMAL(6,2),
  ldl DECIMAL(6,2),
  total_cholesterol DECIMAL(6,2),
  
  -- Hormonal
  testosterone_total DECIMAL(8,2),
  testosterone_free DECIMAL(8,2),
  estradiol DECIMAL(8,2),
  progesterone DECIMAL(8,2),
  cortisol DECIMAL(8,2),
  dhea_s DECIMAL(8,2),
  
  -- Thyroid
  tsh DECIMAL(8,4),
  t3_free DECIMAL(8,2),
  t4_free DECIMAL(8,2),
  
  -- Inflammatory
  crp DECIMAL(8,2),
  homocysteine DECIMAL(8,2),
  
  -- Nutrients
  vitamin_d DECIMAL(8,2),
  b12 DECIMAL(8,2),
  ferritin DECIMAL(8,2),
  
  -- Custom / additional values
  custom_markers JSONB DEFAULT '{}',
  
  -- Analysis
  coach_interpretation TEXT,
  ai_interpretation TEXT,
  flags TEXT[],
  
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_biomarkers_client_date ON biomarker_panels(client_id, panel_date DESC);

-- ============================================================
-- JOURNALS & CHECK-INS
-- ============================================================

CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  entry_type VARCHAR(50) NOT NULL CHECK (entry_type IN (
    'weekly_check_in', 'daily_log', 'session_note', 'milestone', 
    'disruption_report', 'free_form', 'coach_note'
  )),
  
  -- Content
  title VARCHAR(500),
  body TEXT,
  
  -- Structured check-in fields
  sleep_hours DECIMAL(4,2),
  sleep_quality INTEGER CHECK (sleep_quality BETWEEN 1 AND 5),
  stress_level INTEGER CHECK (stress_level BETWEEN 1 AND 5),
  energy_level INTEGER CHECK (energy_level BETWEEN 1 AND 5),
  hunger_level INTEGER CHECK (hunger_level BETWEEN 1 AND 5),
  mood INTEGER CHECK (mood BETWEEN 1 AND 5),
  digestion_quality INTEGER CHECK (digestion_quality BETWEEN 1 AND 5),
  
  -- Disruption flags
  travel_flag BOOLEAN DEFAULT false,
  illness_flag BOOLEAN DEFAULT false,
  work_stress_flag BOOLEAN DEFAULT false,
  family_stress_flag BOOLEAN DEFAULT false,
  
  -- Photo uploads
  progress_photo_urls TEXT[],
  
  -- AI signal extraction
  signals_extracted BOOLEAN DEFAULT false,
  extracted_signals JSONB DEFAULT '{}',
  extraction_model VARCHAR(100),
  extracted_at TIMESTAMPTZ,
  
  -- Impact on BIE variables
  dbi_signal DECIMAL(5,2),
  lsi_signal DECIMAL(5,2),
  cdi_signal DECIMAL(5,2),
  
  is_private BOOLEAN DEFAULT false,
  coach_response TEXT,
  responded_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_journals_client_date ON journal_entries(client_id, entry_date DESC);

-- ============================================================
-- TIMELINE EVENTS (Longitudinal Record)
-- ============================================================

CREATE TABLE timeline_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  event_type VARCHAR(100) NOT NULL CHECK (event_type IN (
    'intake', 'stage_advance', 'stage_regress', 'protocol_created',
    'protocol_updated', 'milestone_reached', 'disruption', 'return_from_disruption',
    'biomarker_panel', 'coach_note', 'program_change', 'graduation', 'pause', 'reactivation'
  )),
  
  title VARCHAR(500) NOT NULL,
  description TEXT,
  payload JSONB DEFAULT '{}',
  
  -- Links
  related_protocol_id UUID REFERENCES protocols(id),
  related_journal_id UUID REFERENCES journal_entries(id),
  related_biomarker_id UUID REFERENCES biomarker_panels(id),
  related_stage_progression_id UUID REFERENCES stage_progressions(id),
  
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_timeline_client_date ON timeline_events(client_id, event_date DESC);

-- ============================================================
-- AI INSIGHTS & COACHING QUEUE
-- ============================================================

CREATE TABLE ai_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  
  insight_date DATE NOT NULL DEFAULT CURRENT_DATE,
  insight_type VARCHAR(100) NOT NULL CHECK (insight_type IN (
    'weekly_summary', 'protocol_recommendation', 'stage_readiness',
    'disruption_alert', 'biomarker_flag', 'pattern_detected', 'coaching_suggestion'
  )),
  
  -- Content
  title VARCHAR(500) NOT NULL,
  summary TEXT NOT NULL,
  full_analysis TEXT,
  recommendations TEXT[],
  
  -- Confidence & sourcing
  confidence_score DECIMAL(3,2),
  source_variables TEXT[],
  model_used VARCHAR(100),
  
  -- Coach review
  coach_reviewed BOOLEAN DEFAULT false,
  coach_approved BOOLEAN,
  coach_response TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id),
  
  -- Delivery
  delivered_to_client BOOLEAN DEFAULT false,
  delivered_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- COACH ASSIGNMENTS & PERMISSIONS
-- ============================================================

CREATE TABLE coach_client_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coach_id UUID NOT NULL REFERENCES users(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  is_primary BOOLEAN DEFAULT true,
  unassigned_at TIMESTAMPTZ,
  UNIQUE(coach_id, client_id)
);

-- ============================================================
-- AUDIT LOG
-- ============================================================

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  client_id UUID REFERENCES clients(id),
  action VARCHAR(200) NOT NULL,
  resource_type VARCHAR(100),
  resource_id UUID,
  payload JSONB DEFAULT '{}',
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_log_client ON audit_log(client_id, created_at DESC);
CREATE INDEX idx_audit_log_user ON audit_log(user_id, created_at DESC);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_protocols_updated_at BEFORE UPDATE ON protocols
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_journals_updated_at BEFORE UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-deactivate previous protocol when new version created
CREATE OR REPLACE FUNCTION deactivate_prior_protocol()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active = true AND NEW.version > 1 THEN
    UPDATE protocols
    SET is_active = false,
        superseded_by = NEW.id,
        superseded_at = NOW()
    WHERE client_id = NEW.client_id
      AND protocol_type = NEW.protocol_type
      AND id != NEW.id
      AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_deactivate_prior_protocol AFTER INSERT ON protocols
  FOR EACH ROW EXECUTE FUNCTION deactivate_prior_protocol();

-- Auto-create timeline event on stage progression
CREATE OR REPLACE FUNCTION timeline_on_stage_progression()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO timeline_events (client_id, event_date, event_type, title, description, payload, related_stage_progression_id)
  VALUES (
    NEW.client_id,
    NEW.effective_date,
    CASE WHEN NEW.direction = 'advance' THEN 'stage_advance'
         WHEN NEW.direction = 'regress' THEN 'stage_regress'
         ELSE 'stage_advance' END,
    'Stage ' || INITCAP(NEW.direction) || ': ' || COALESCE(NEW.from_stage, 'Entry') || ' → ' || NEW.to_stage,
    NEW.rationale,
    jsonb_build_object('from_stage', NEW.from_stage, 'to_stage', NEW.to_stage, 'direction', NEW.direction),
    NEW.id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_timeline_stage_progression AFTER INSERT ON stage_progressions
  FOR EACH ROW EXECUTE FUNCTION timeline_on_stage_progression();

-- Auto-create timeline event on protocol creation
CREATE OR REPLACE FUNCTION timeline_on_protocol_created()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO timeline_events (client_id, event_date, event_type, title, description, payload, related_protocol_id)
  VALUES (
    NEW.client_id,
    NEW.effective_date,
    CASE WHEN NEW.version = 1 THEN 'protocol_created' ELSE 'protocol_updated' END,
    CASE WHEN NEW.version = 1 THEN 'Protocol Created: ' ELSE 'Protocol Updated (v' || NEW.version || '): ' END || NEW.name,
    'Generated via: ' || NEW.generated_by || ' | Stage: ' || NEW.stage,
    jsonb_build_object('protocol_type', NEW.protocol_type, 'version', NEW.version, 'stage', NEW.stage),
    NEW.id
  );
  
  -- Audit log
  INSERT INTO protocol_change_log (protocol_id, client_id, action, change_summary)
  VALUES (NEW.id, NEW.client_id, 'created', 'Protocol v' || NEW.version || ' created for stage: ' || NEW.stage);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_timeline_protocol_created AFTER INSERT ON protocols
  FOR EACH ROW EXECUTE FUNCTION timeline_on_protocol_created();
