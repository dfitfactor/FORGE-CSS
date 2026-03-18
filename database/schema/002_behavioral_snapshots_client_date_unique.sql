-- Add unique constraint for snapshot upserts (Neon/Postgres)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'behavioral_snapshots_client_date_unique'
  ) THEN
    ALTER TABLE behavioral_snapshots
      ADD CONSTRAINT behavioral_snapshots_client_date_unique UNIQUE (client_id, snapshot_date);
  END IF;
END
$$;

