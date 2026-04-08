ALTER TABLE package_enrollments
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_renewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_renewal_at TIMESTAMPTZ;

UPDATE package_enrollments
SET subscription_status = COALESCE(NULLIF(subscription_status, ''), 'active')
WHERE true;

CREATE TABLE IF NOT EXISTS reminder_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_reminder_log_client_type_sent_at
  ON reminder_log (client_id, reminder_type, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_reminder_log_booking_type
  ON reminder_log (booking_id, reminder_type);
