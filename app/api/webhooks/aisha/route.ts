import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { convertLeadToClient } from '@/lib/lead-conversion'

const AishaInboundSchema = z.object({
  email: z.string().trim().email(),
  first_name: z.string().trim().optional().nullable(),
  last_name: z.string().trim().optional().nullable(),
  status: z.string().trim().optional().nullable(),
  score: z.number().int().optional().nullable(),
  company: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  source: z.string().trim().optional().nullable(),
  next_action: z.string().trim().optional().nullable(),
  goal: z.string().trim().optional().nullable(),
  aisha_lead_id: z.string().trim().optional().nullable(),
  event_type: z.string().trim().optional().nullable(),
})

type ExistingLeadRow = {
  id: string
  converted_to_client: boolean
}

export async function POST(request: NextRequest) {
  let rawBody: unknown = null

  try {
    rawBody = await request.json().catch(() => null)
    const providedSecret = request.headers.get('x-aisha-secret')
    const expectedSecret = process.env.AISHA_WEBHOOK_SECRET?.trim()

    if (!providedSecret) {
      console.warn('[webhooks/aisha] missing x-aisha-secret header; continuing for manual setup compatibility', rawBody)
    } else if (expectedSecret && providedSecret !== expectedSecret) {
      console.error('[webhooks/aisha] secret mismatch; event ignored')
      return NextResponse.json({ success: true })
    }

    const parsed = AishaInboundSchema.safeParse(rawBody)
    if (!parsed.success) {
      console.error('[webhooks/aisha] invalid payload:', parsed.error.flatten(), rawBody)
      return NextResponse.json({ success: true })
    }

    const payload = parsed.data
    const eventType = payload.event_type || 'lead.updated'

    const existing = await db.queryOne<ExistingLeadRow>(
      `SELECT id, converted_to_client
       FROM leads
       WHERE LOWER(email) = LOWER($1)
          OR ($2 IS NOT NULL AND aisha_lead_id = $2)
       ORDER BY updated_at DESC
       LIMIT 1`,
      [payload.email, payload.aisha_lead_id ?? null]
    )

    let leadId = existing?.id ?? null

    if (!existing) {
      const inserted = await db.queryOne<{ id: string }>(
        `INSERT INTO leads (
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
           aisha_synced_at,
           last_aisha_event,
           last_aisha_event_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           COALESCE($8, 'new'),
           $9, $10, $11, $12, $13::jsonb,
           true, NOW(), $14, NOW()
         )
         RETURNING id`,
        [
          payload.aisha_lead_id ?? null,
          payload.first_name ?? null,
          payload.last_name ?? null,
          payload.email,
          payload.phone ?? null,
          payload.company ?? null,
          payload.source ?? null,
          payload.status ?? null,
          payload.score ?? null,
          payload.notes ?? null,
          payload.next_action ?? null,
          payload.goal ?? null,
          JSON.stringify(rawBody ?? payload),
          eventType,
        ]
      )

      leadId = inserted?.id ?? null
    } else {
      await db.query(
        `UPDATE leads
         SET aisha_lead_id = COALESCE($2, aisha_lead_id),
             first_name = COALESCE($3, first_name),
             last_name = COALESCE($4, last_name),
             phone = COALESCE($5, phone),
             company = COALESCE($6, company),
             source = COALESCE($7, source),
             status = COALESCE($8, status),
             score = COALESCE($9, score),
             notes = COALESCE($10, notes),
             next_action = COALESCE($11, next_action),
             goal = COALESCE($12, goal),
             raw_payload = $13::jsonb,
             aisha_synced = true,
             aisha_synced_at = NOW(),
             last_aisha_event = $14,
             last_aisha_event_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [
          existing.id,
          payload.aisha_lead_id ?? null,
          payload.first_name ?? null,
          payload.last_name ?? null,
          payload.phone ?? null,
          payload.company ?? null,
          payload.source ?? null,
          payload.status ?? null,
          payload.score ?? null,
          payload.notes ?? null,
          payload.next_action ?? null,
          payload.goal ?? null,
          JSON.stringify(rawBody ?? payload),
          eventType,
        ]
      )
    }

    if (leadId && eventType === 'lead.won' && !existing?.converted_to_client) {
      await convertLeadToClient(leadId)
    }
  } catch (error) {
    console.error('[webhooks/aisha] POST error:', error)
  }

  return NextResponse.json({ success: true })
}
