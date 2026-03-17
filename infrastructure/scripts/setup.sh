#!/bin/bash
# ============================================================
# FORGË CSS — Infrastructure Setup Script
# Run: bash infrastructure/scripts/setup.sh
# ============================================================

set -e

echo "🔥 FORGË CSS — Setup Script"
echo "=================================="

# Check prerequisites
check_command() {
  if ! command -v "$1" &> /dev/null; then
    echo "❌ Required: $1 not found"
    exit 1
  fi
  echo "  ✓ $1 found"
}

echo ""
echo "Checking prerequisites..."
check_command node
check_command npm
check_command psql

# Check Node version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "❌ Node.js 18+ required (found: $(node --version))"
  exit 1
fi

echo ""
echo "Setting up environment..."
if [ ! -f ".env.local" ]; then
  cp infrastructure/env/.env.example .env.local
  echo "  ✓ Created .env.local from template"
  echo "  ⚠️  Edit .env.local with your configuration before continuing"
else
  echo "  ✓ .env.local already exists"
fi

echo ""
echo "Installing dependencies..."
npm install
echo "  ✓ Dependencies installed"

echo ""
echo "Setting up PostgreSQL database..."
# Create database and user
psql -U postgres << 'EOF'
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'forge_admin') THEN
    CREATE USER forge_admin WITH PASSWORD 'change_this_password';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'forge_css') THEN
    CREATE DATABASE forge_css OWNER forge_admin;
  END IF;
END $$;

GRANT ALL PRIVILEGES ON DATABASE forge_css TO forge_admin;
EOF

echo "  ✓ Database configured"

echo ""
echo "Running migrations..."
psql -U forge_admin -d forge_css -f database/schema/001_initial.sql
echo "  ✓ Schema applied"

echo ""
echo "Seeding development data..."
node database/seed-data/seed.js
echo "  ✓ Seed data loaded"

echo ""
echo "=================================="
echo "✅ FORGË CSS setup complete!"
echo ""
echo "Start the development server:"
echo "  npm run dev"
echo ""
echo "Access the platform at:"
echo "  http://localhost:3000"
echo ""
echo "Coach login:"
echo "  Email: coach@dfitfactor.com"
echo "  Password: coach-2025"
