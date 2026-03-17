# FORGË CSS — Platform Architecture

## System Overview

The FORGË Client Support System (CSS) is a full-stack behavioral intelligence platform built on Next.js and PostgreSQL. It implements the FORGË Behavioral Intelligence Engine (BIE) for adaptive client protocol generation.

## Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                   COACH INTERFACE                        │
│            Next.js 14 App Router (React)                 │
├─────────────────────────────────────────────────────────┤
│                    API LAYER                             │
│              Next.js API Routes (REST)                   │
│              Auth: JWT + HTTP-only cookies               │
├────────────────────┬────────────────────────────────────┤
│   BEHAVIORAL       │         AI SERVICE                  │
│   ENGINE           │    Claude API Integration           │
│   bie-engine.ts    │    Protocol Generation              │
│   (BAR/BLI/DBI/   │    Signal Extraction                │
│    CDI/LSI/PPS)   │    Weekly Insights                  │
├────────────────────┴────────────────────────────────────┤
│                  DATA LAYER                              │
│                PostgreSQL (with RLS)                     │
│             Immutable Protocol Versioning                │
│               Full Audit Trail                          │
└─────────────────────────────────────────────────────────┘
```

## Core Design Principles

### 1. Behavioral State Drives Everything
- No hardcoded programming schedules
- All protocols computed from BIE variable snapshot
- Generation State (A-E) routes every decision

### 2. Strict Protocol Versioning
- Protocols are NEVER overwritten
- Every update creates a new version with full context snapshot
- Immutable audit trail via `protocol_change_log`
- Prior versions accessible in history view

### 3. Client Data Isolation
- Row Level Security on `clients` table
- `coach_id` filter enforced at DB level
- API layer validates `coach_id` on every client access
- No cross-client data contamination possible

### 4. Non-Punitive Adaptation
- Volume and complexity degrade gracefully
- State D/E: simplify session, never block it
- BAR below threshold → simplified protocol, not withheld
- All adjustments logged with rationale

## Key Entities

| Entity | Purpose |
|--------|---------|
| `clients` | Longitudinal client record with full history |
| `behavioral_snapshots` | Daily BIE variable snapshots (BAR/BLI/DBI/CDI/LSI/PPS) |
| `protocols` | Versioned protocol records (movement, nutrition, recovery) |
| `protocol_change_log` | Immutable audit trail for all protocol events |
| `adherence_records` | Per-session and per-day completion tracking |
| `journal_entries` | Check-ins with AI signal extraction |
| `timeline_events` | Longitudinal journey events auto-generated |
| `ai_insights` | Coach-reviewed AI coaching insights |
| `stage_progressions` | Stage advancement/regression history |
| `biomarker_panels` | Lab and physical measurement tracking |

## BIE Variable Stack

| Variable | Range | Meaning | Effect |
|----------|-------|---------|--------|
| BAR | 0-100 | Behavioral Adherence Rate | ≥80 = progression eligible |
| BLI | 0-100 | Behavioral Load Index | >70 = volume reduction |
| DBI | 0-100 | Decision Burden Index | >70 = recovery mode |
| CDI | 0-100 | Cognitive Demand Index | >70 = restrict complexity |
| LSI | 0-100 | Lifestyle Stability Index | Governs frequency |
| PPS | 0-100 | Progression Probability Score | Gate for advancement |

## Generation States

| State | Condition | Volume | Complexity |
|-------|-----------|--------|------------|
| A — Stable Progression | BAR ≥80, BLI<70, DBI<30, PPS≥70 | Full | Stage ceiling |
| B — Consolidation | BAR acceptable, PPS<70 | Moderate | Hold current |
| C — Simplified Load | BLI elevated OR BAR declining | Reduced (-20-30%) | -1 tier |
| D — Recovery/Disruption | DBI ≥70 OR LSI critical | Minimum viable | Tier 1-2 only |
| E — Rebuild/Re-entry | Post-disruption OR new user | Minimum viable | Tier 1-2 only |

## Protocol Versioning Flow

```
Coach requests new protocol
         ↓
Fetch latest BIE snapshot
         ↓
Compute Generation State (A-E)
         ↓
AI generates protocol payload (Claude)
         ↓
Insert new protocol record (version N+1)
         ↓
DB trigger deactivates prior version
         ↓
DB trigger logs to protocol_change_log
         ↓
DB trigger creates timeline event
         ↓
Prior versions remain in history
```

## Security Model

- HTTP-only JWT cookies (7-day expiry)
- bcrypt password hashing (12 rounds)
- PostgreSQL Row Level Security
- Session-scoped DB context injection
- Coach can only access own clients
- Admin role bypasses RLS for platform ops

## AI Integration

The Claude API is called for:
1. **Protocol Generation** — `POST /api/protocols`
2. **Journal Signal Extraction** — async after journal POST
3. **Weekly Insights** — batch job or on-demand

The AI service (`services/ai-service/index.ts`) abstracts all Claude API calls. The system prompt encodes the full BIE philosophy and decision rules.

## File Structure

```
forge-css/
├── app/                    # Next.js App Router
│   ├── api/               # REST API routes
│   ├── (dashboard)/       # Auth-gated dashboard pages
│   ├── auth/              # Login/auth pages
│   └── clients/           # Client management pages
├── components/            # React components
│   ├── ui/               # Shared UI (Sidebar, etc.)
│   └── modules/          # Feature-specific components
├── services/              # Business logic services
│   ├── ai-service/       # Claude API integration
│   └── protocol-engine/  # Protocol versioning
├── lib/                   # Shared utilities
│   ├── db.ts             # PostgreSQL client
│   ├── auth.ts           # JWT authentication
│   └── bie-engine.ts     # BIE computation logic
├── database/
│   ├── schema/           # SQL schema files
│   └── seed-data/        # Development seed data
└── infrastructure/
    ├── env/              # Environment templates
    └── scripts/          # Setup and maintenance scripts
```
