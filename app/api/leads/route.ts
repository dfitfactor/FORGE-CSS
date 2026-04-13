import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession, requireRole } from '@/lib/auth'
import { db } from '@/lib/db'
import { createAishaLead } from '@/lib/aisha'
import { LEAD_SOURCES, LEAD_STATUSES, type LeadRecord } from '@/lib/leads'

const CreateLeadSchema = z.object({
  first_name: z.string().trim().min(1).max(120),
  last_name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  phone: z.string().trim().max(50).optional().nullable(),
  company: z.string().trim().max(160).optional().nullable(),
  source: z.enum(LEAD_SOURCES).optional().default('manual'),
  status: z.enum(LEAD_STATUSES).optional().default('new'),
  score: z.number().int().min(0).max(100).optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
  next_action: z.string().trim().max(500).optional().nullable(),
  goal: z.string().trim().max(1000).optional().nullable(),
})

type LeadStatsRow = {
  total_leads: string
  this_month: string
  this_week: string
  discovery_booked: string
  total_won: string
}

async function getLeadStats() {
  const row = await db.queryOne<LeadStatsRow>(
    `SELECT
       COUNT(*)::text AS total_leads,
       COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now()))::text AS this_month,
       COUNT(*) FILTER (WHERE created_at >= date_trunc('week', now()))::text AS this_week,
       COUNT(*) FILTER (WHERE status = 'discovery_booked')::text AS discovery_booked,
       COUNT(*) FILTER (WHERE status = 'won')::text AS total_won
     FROM leads`
  )

  return {
    total_leads: Number(row?.total_leads ?? '0'),
    this_month: Number(row?.this_month ?? '0'),
    this_week: Number(row?.this_week ?? '0'),
    discovery_booked: Number(row?.discovery_booked ?? '0'),
    total_won: Number(row?.total_won ?? '0'),
  }
}

export async function GET(request: NextRequest) {
  const session = await getSession(request)

  try {
    requireRole(session, 'coach', 'admin')
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const [leads, stats] = await Promise.all([
      db.query<LeadRecord>(
        `SELECT id,
                aisha_lead_id,
                first_name,
                last_name,
                email,
                phone,
                company,
                source,
                status,
                score,
                notes,
                next_action,
                goal,
                raw_payload,
                aisha_synced,
                aisha_synced_at::text AS aisha_synced_at,
                converted_to_client,
                client_id,
                converted_at::text AS converted_at,
                converted_by,
                last_aisha_event,
                last_aisha_event_at::text AS last_aisha_event_at,
                created_at::text AS created_at,
                updated_at::text AS updated_at
         FROM leads
         ORDER BY created_at DESC`
      ),
      getLeadStats(),
    ])

    return NextResponse.json({ leads, stats })
  } catch (error) {
    console.error('[api/leads] GET error:', error)
    return NextResponse.json({ error: 'Failed to load leads' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  let actor

  try {
    actor = requireRole(session, 'coach', 'admin')
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => null)
    const parsed = CreateLeadSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }

    const data = parsed.data

    const lead = await db.queryOne<LeadRecord>(
      `INSERT INTO leads (
         first_name,
         last_name,
         email,
         phone,
         company,
         source,
         status,
         score,
         notes,
         next_action,
         goal,
         raw_payload,
         last_aisha_event,
         last_aisha_event_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, 'lead.created', NOW()
       )
       RETURNING id,
                 aisha_lead_id,
                 first_name,
                 last_name,
                 email,
                 phone,
                 company,
                 source,
                 status,
                 score,
                 notes,
                 next_action,
                 goal,
                 raw_payload,
                 aisha_synced,
                 aisha_synced_at::text AS aisha_synced_at,
                 converted_to_client,
                 client_id,
                 converted_at::text AS converted_at,
                 converted_by,
                 last_aisha_event,
                 last_aisha_event_at::text AS last_aisha_event_at,
                 created_at::text AS created_at,
                 updated_at::text AS updated_at`,
      [
        data.first_name,
        data.last_name,
        data.email,
        data.phone ?? null,
        data.company ?? null,
        data.source,
        data.status,
        data.score ?? null,
        data.notes ?? null,
        data.next_action ?? null,
        data.goal ?? null,
        JSON.stringify(body ?? data),
      ]
    )

    if (!lead) {
      return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 })
    }

    const syncResult = await createAishaLead(lead)

    await db.query(
      `UPDATE leads
       SET aisha_synced = $2,
           aisha_synced_at = CASE WHEN $2 THEN NOW() ELSE aisha_synced_at END,
           updated_at = NOW()
       WHERE id = $1`,
      [lead.id, syncResult.success]
    ).catch(() => undefined)

    await db.query(
      `INSERT INTO audit_log (user_id, action, resource_type, resource_id, payload)
       VALUES ($1, 'lead.created', 'lead', $2, $3::jsonb)`,
      [actor.id, lead.id, JSON.stringify({ email: lead.email, source: lead.source, synced: syncResult.success })]
    ).catch(() => undefined)

    return NextResponse.json(
      {
        lead: {
          ...lead,
          aisha_synced: syncResult.success,
          aisha_synced_at: syncResult.success ? new Date().toISOString() : lead.aisha_synced_at,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[api/leads] POST error:', error)
    return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 })
  }
}
