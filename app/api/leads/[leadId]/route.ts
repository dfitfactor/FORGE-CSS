import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession, requireRole } from '@/lib/auth'
import { db } from '@/lib/db'
import { convertLeadToClient } from '@/lib/lead-conversion'
import { updateAishaLeadStage } from '@/lib/aisha'
import { LEAD_STATUSES, type LeadRecord } from '@/lib/leads'

const UpdateLeadSchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  notes: z.string().trim().max(5000).optional().nullable(),
  next_action: z.string().trim().max(500).optional().nullable(),
})

async function getLead(leadId: string) {
  return db.queryOne<LeadRecord>(
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
     WHERE id = $1`,
    [leadId]
  )
}

export async function GET(request: NextRequest, { params }: { params: { leadId: string } }) {
  const session = await getSession(request)

  try {
    requireRole(session, 'coach', 'admin')
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const lead = await getLead(params.leadId)
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    return NextResponse.json({ lead })
  } catch (error) {
    console.error('[api/leads/[leadId]] GET error:', error)
    return NextResponse.json({ error: 'Failed to load lead' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { leadId: string } }) {
  const session = await getSession(request)
  let actor

  try {
    actor = requireRole(session, 'coach', 'admin')
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => null)
    const parsed = UpdateLeadSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }

    const existingLead = await getLead(params.leadId)
    if (!existingLead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    const data = parsed.data
    const nextStatus = data.status ?? existingLead.status

    await db.query(
      `UPDATE leads
       SET status = $2,
           notes = COALESCE($3, notes),
           next_action = COALESCE($4, next_action),
           updated_at = NOW()
       WHERE id = $1`,
      [params.leadId, nextStatus, data.notes ?? null, data.next_action ?? null]
    )

    const updatedLead = await getLead(params.leadId)

    if (updatedLead) {
      await updateAishaLeadStage(updatedLead, nextStatus)
    }

    let conversion: Awaited<ReturnType<typeof convertLeadToClient>> | null = null
    if (nextStatus === 'won') {
      conversion = await convertLeadToClient(params.leadId, actor.id)
    }

    await db.query(
      `INSERT INTO audit_log (user_id, client_id, action, resource_type, resource_id, payload)
       VALUES ($1, $2, 'lead.updated', 'lead', $3, $4::jsonb)`,
      [actor.id, updatedLead?.client_id ?? null, params.leadId, JSON.stringify({ status: nextStatus })]
    ).catch(() => undefined)

    return NextResponse.json({ lead: updatedLead, conversion })
  } catch (error) {
    console.error('[api/leads/[leadId]] PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 })
  }
}
