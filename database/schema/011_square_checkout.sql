ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_provider TEXT,
  ADD COLUMN IF NOT EXISTS square_payment_link_id TEXT,
  ADD COLUMN IF NOT EXISTS square_order_id TEXT,
  ADD COLUMN IF NOT EXISTS square_payment_id TEXT;

CREATE INDEX IF NOT EXISTS idx_bookings_square_order_id
  ON bookings (square_order_id);

CREATE INDEX IF NOT EXISTS idx_bookings_square_payment_id
  ON bookings (square_payment_id);

ALTER TABLE package_enrollments
  ADD COLUMN IF NOT EXISTS payment_provider TEXT,
  ADD COLUMN IF NOT EXISTS square_payment_id TEXT;
