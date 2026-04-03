CREATE TABLE IF NOT EXISTS package_included_services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  monthly_session_allotment INTEGER NOT NULL CHECK (monthly_session_allotment > 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(package_id, service_id)
);

CREATE INDEX IF NOT EXISTS idx_package_included_services_package
  ON package_included_services(package_id);

CREATE INDEX IF NOT EXISTS idx_package_included_services_service
  ON package_included_services(service_id);

DROP TRIGGER IF EXISTS update_package_included_services_updated_at ON package_included_services;

CREATE TRIGGER update_package_included_services_updated_at
  BEFORE UPDATE ON package_included_services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

