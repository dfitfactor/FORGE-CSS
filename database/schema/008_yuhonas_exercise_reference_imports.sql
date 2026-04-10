CREATE TABLE IF NOT EXISTS exercise_source_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name TEXT NOT NULL,
  source_version TEXT,
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  import_notes TEXT,
  total_imported INTEGER,
  total_matched INTEGER,
  total_unmatched INTEGER,
  total_duplicates INTEGER,
  total_enriched INTEGER,
  total_flagged INTEGER,
  total_failed INTEGER
);

CREATE TABLE IF NOT EXISTS exercise_reference_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_import_id UUID REFERENCES exercise_source_imports(id),
  source_name TEXT NOT NULL DEFAULT 'yuhonas',
  source_record_id TEXT,
  canonical_name TEXT,
  display_name TEXT,
  slug TEXT UNIQUE,
  category TEXT,
  movement_pattern TEXT,
  primary_muscles TEXT[],
  secondary_muscles TEXT[],
  equipment_required TEXT,
  force_type TEXT,
  mechanic_type TEXT,
  difficulty_level TEXT,
  instructions TEXT[],
  image_refs TEXT[],
  raw_payload JSONB,
  normalization_status TEXT DEFAULT 'pending',
  duplicate_status TEXT DEFAULT 'unknown',
  review_status TEXT DEFAULT 'pending',
  approved_for_fallback BOOLEAN DEFAULT false,
  safety_flags TEXT[],
  contraindication_notes TEXT,
  population_restrictions TEXT[],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exercise_match_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_exercise_id UUID REFERENCES exercises(id),
  reference_record_id UUID REFERENCES exercise_reference_records(id),
  match_confidence NUMERIC(4,2),
  match_reason TEXT,
  enrichment_recommendation TEXT,
  manual_review_status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exercise_reference_records_source_name
  ON exercise_reference_records(source_name);
CREATE INDEX IF NOT EXISTS idx_exercise_reference_records_review_status
  ON exercise_reference_records(review_status);
CREATE INDEX IF NOT EXISTS idx_exercise_reference_records_approved_for_fallback
  ON exercise_reference_records(approved_for_fallback);
CREATE INDEX IF NOT EXISTS idx_exercise_reference_records_duplicate_status
  ON exercise_reference_records(duplicate_status);
CREATE INDEX IF NOT EXISTS idx_exercise_match_candidates_primary_exercise_id
  ON exercise_match_candidates(primary_exercise_id);
CREATE INDEX IF NOT EXISTS idx_exercise_match_candidates_reference_record_id
  ON exercise_match_candidates(reference_record_id);
CREATE INDEX IF NOT EXISTS idx_exercise_match_candidates_match_confidence
  ON exercise_match_candidates(match_confidence);
