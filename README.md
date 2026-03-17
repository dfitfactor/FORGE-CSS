# FORGË CSS — Client Support System

**FORGË Behavioral Intelligence Platform — Internal Coach Portal**

> *Behavior-driven adaptive coaching infrastructure for DFitFactor*

---

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Anthropic API key

### Setup

```bash
# 1. Clone / open in your project directory
# C:\FORGE\Internal Platform\FORGE CSS

# 2. Install dependencies
npm install

# 3. Configure environment
cp infrastructure/env/.env.example .env.local
# Edit .env.local with your database and API credentials

# 4. Initialize database
psql -U postgres -c "CREATE USER forge_admin WITH PASSWORD 'yourpassword';"
psql -U postgres -c "CREATE DATABASE forge_css OWNER forge_admin;"
psql -U forge_admin -d forge_css -f database/schema/001_initial.sql

# 5. Seed development data
node database/seed-data/seed.js

# 6. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

**Default Login (development):**
- Email: `coach@dfitfactor.com`
- Password: `coach-2025`

---

## Platform Features

### Client Journey Tracking
- Full longitudinal client record from intake through graduation
- Stage progression with behavioral criteria enforcement
- Timeline of all significant events

### FORGË Stage System
Five progressive stages: **Foundations → Optimization → Resilience → Growth → Empowerment**

Advancement governed by BAR ≥ 80 + PPS ≥ 70 + minimum weeks in stage.

### Behavioral Intelligence Engine (BIE)
Six variables tracked per client per day:
- **BAR** — Behavioral Adherence Rate
- **BLI** — Behavioral Load Index  
- **DBI** — Decision Burden Index
- **CDI** — Cognitive Demand Index
- **LSI** — Lifestyle Stability Index
- **PPS** — Progression Probability Score

Five generation states (A-E) computed from variables to route all programming decisions.

### Protocol Generation
- AI-powered protocol generation via Claude API
- Strict versioning — protocols are never overwritten, always versioned
- Full audit trail for every protocol event
- Movement, Nutrition, Recovery, and Composite protocols

### Journal & Signal Extraction
- Client check-in logging with structured fields
- AI-powered behavioral signal extraction from free-form journal text
- Disruption flag detection (travel, illness, stress events)

### Adherence Tracking
- Session completion tracking
- BAR computation from weekly adherence data
- Trend analysis across weeks

### Biomarker Tracking
- Comprehensive lab panel recording
- Key markers: hormonal, metabolic, inflammatory, nutritional
- Coach interpretation with AI analysis

### AI Coaching Insights
- Weekly behavioral summaries
- Stage readiness assessments
- Pattern detection alerts
- Coach-reviewed before delivery to client

---

## Architecture

See `docs/architecture/ARCHITECTURE.md` for full documentation.

**Stack:**
- **Frontend:** Next.js 14 (App Router) + Tailwind CSS
- **Backend:** Next.js API Routes
- **Database:** PostgreSQL with Row Level Security
- **AI:** Anthropic Claude API (claude-opus-4-6)
- **Auth:** JWT + HTTP-only cookies

**Client Isolation:** PostgreSQL Row Level Security ensures no cross-client data access. Every API route validates `coach_id` ownership before serving client data.

---

## Project Structure

```
FORGE CSS/
├── app/                    Next.js pages and API routes
├── components/             Reusable React components
├── services/               Business logic (AI, protocols)
├── lib/                    Core utilities (DB, auth, BIE engine)
├── database/               SQL schema and seed data
├── docs/                   Architecture documentation
└── infrastructure/         Config templates and scripts
```

---

*FORGË Behavioral Intelligence Platform · © DFitFactor 2026*
*Faith forges the future.*
