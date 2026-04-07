CREATE TABLE IF NOT EXISTS coach_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_booked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coach_availability_date_time
  ON coach_availability (date, start_time);

ALTER TABLE package_enrollments
  ADD COLUMN IF NOT EXISTS sessions_remaining INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sessions_total INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weekly_limit INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS monthly_limit INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS billing_cycle_start DATE,
  ADD COLUMN IF NOT EXISTS billing_cycle_end DATE,
  ADD COLUMN IF NOT EXISTS sessions_expire_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS override_limits BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS override_expiration BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS override_set_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS override_set_at TIMESTAMPTZ;

ALTER TABLE package_enrollments
  ALTER COLUMN sessions_remaining SET DEFAULT 0,
  ALTER COLUMN sessions_total SET DEFAULT 0,
  ALTER COLUMN weekly_limit SET DEFAULT 1,
  ALTER COLUMN monthly_limit SET DEFAULT 4,
  ALTER COLUMN override_limits SET DEFAULT false,
  ALTER COLUMN override_expiration SET DEFAULT false;

UPDATE package_enrollments
SET sessions_total = COALESCE(sessions_total, 0),
    sessions_remaining = COALESCE(sessions_remaining, sessions_total, 0),
    weekly_limit = COALESCE(weekly_limit, sessions_per_week, 1),
    monthly_limit = COALESCE(monthly_limit, sessions_total, 4)
WHERE true;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS availability_id UUID REFERENCES coach_availability(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS declined_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS session_deducted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_makeup BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE bookings
  ALTER COLUMN session_deducted SET DEFAULT false,
  ALTER COLUMN is_makeup SET DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_bookings_client_scheduled_at
  ON bookings (client_id, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_bookings_availability_id
  ON bookings (availability_id);
