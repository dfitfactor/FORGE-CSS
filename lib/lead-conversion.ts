import type { PoolClient } from 'pg'
import { db } from '@/lib/db'
import { markAishaLeadWon } from '@/lib/aisha'
import { sendLeadWelcomeEmail } from '@/lib/email'

type LeadRow = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string
  phone: string | null
  source: string | null
  notes: string | null
  goal: string | null
  converted_to_client: boolean
  client_id: string | null
}

type ClientRow = {
  id: string
  full_name: string | null
}

type ConvertResult = {
  success: boolean
  clientId: string | null
  existing: boolean
  alreadyConverted?: boolean
}

function buildLeadName(lead: Pick<LeadRow, 'first_name' | 'last_name' | 'email'>) {
  const fullName = `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim()
  return fullName || lead.email
}

async function findFallbackCoachId(client: PoolClient) {
  const coach = await client.query<{ id: string }>(
    `SELECT id
     FROM users
     WHERE is_active = true
       AND role IN ('admin', 'coach')
     ORDER BY
       CASE WHEN LOWER(email) = 'coach@dfitfactor.com' THEN 0 ELSE 1 END,
       CASE WHEN role = 'admin' THEN 0 ELSE 1 END,
       created_at ASC
     LIMIT 1`
  )

  return coach.rows[0]?.id ?? null
}

function bookingUrl() {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://css.forgeforyou.com')

  return `${baseUrl.replace(/\/$/, '')}/book`
}

export async function convertLeadToClient(leadId: string, coachId?: string): Promise<ConvertResult> {
  let leadForSideEffects: LeadRow | null = null
  let createdClientId: string | null = null
  let createdClientName: string | null = null
  let existing = false
  let alreadyConverted = false

  try {
    const result = await db.transaction(async (client) => {
      const leadResult = await client.query<LeadRow>(
        `SELECT id,
                first_name,
                last_name,
                email,
                phone,
                source,
                notes,
                goal,
                converted_to_client,
                client_id
         FROM leads
         WHERE id = $1
         FOR UPDATE`,
        [leadId]
      )

      const lead = leadResult.rows[0]
      if (!lead) {
        return { success: false, clientId: null, existing: false, alreadyConverted: false }
      }

      leadForSideEffects = lead

      if (lead.converted_to_client && lead.client_id) {
        alreadyConverted = true
        return { success: true, clientId: lead.client_id, existing: true, alreadyConverted: true }
      }

      const existingClientResult = await client.query<ClientRow>(
        `SELECT id, full_name
         FROM clients
         WHERE LOWER(email) = LOWER($1)
         LIMIT 1`,
        [lead.email]
      )

      const existingClient = existingClientResult.rows[0]
      if (existingClient) {
        existing = true
        createdClientId = existingClient.id
        createdClientName = existingClient.full_name ?? buildLeadName(lead)

        await client.query(
          `UPDATE leads
           SET converted_to_client = true,
               client_id = $2,
               converted_at = NOW(),
               converted_by = COALESCE($3, converted_by),
               status = 'won',
               updated_at = NOW()
           WHERE id = $1`,
          [lead.id, existingClient.id, coachId ?? null]
        )

        await client.query(
          `INSERT INTO audit_log (user_id, client_id, action, resource_type, resource_id, payload)
           VALUES ($1, $2, 'lead.converted_existing_client', 'lead', $3, $4::jsonb)`,
          [coachId ?? null, existingClient.id, lead.id, JSON.stringify({ leadId: lead.id })]
        ).catch(() => undefined)

        return { success: true, clientId: existingClient.id, existing: true, alreadyConverted: false }
      }

      const assignedCoachId = coachId ?? (await findFallbackCoachId(client))
      if (!assignedCoachId) {
        throw new Error('No active coach is available to assign this lead')
      }

      const fullName = buildLeadName(lead)
      const newClientResult = await client.query<{ id: string }>(
        `INSERT INTO clients (
           coach_id,
           full_name,
           email,
           phone,
           intake_date,
           primary_goal,
           notes,
           current_stage,
           status
         ) VALUES (
           $1, $2, $3, $4, CURRENT_DATE, $5, $6, 'foundations', 'active'
         )
         RETURNING id`,
        [assignedCoachId, fullName, lead.email, lead.phone, lead.goal, lead.notes]
      )

      const newClientId = newClientResult.rows[0]?.id
      if (!newClientId) {
        throw new Error('Failed to create client from lead')
      }

      createdClientId = newClientId
      createdClientName = fullName

      await client.query(
        `UPDATE leads
         SET converted_to_client = true,
             client_id = $2,
             converted_at = NOW(),
             converted_by = COALESCE($3, $4),
             status = 'won',
             updated_at = NOW()
         WHERE id = $1`,
        [lead.id, newClientId, coachId ?? null, assignedCoachId]
      )

      await client.query(
        `INSERT INTO timeline_events (client_id, event_type, title, description, event_date, created_by)
         VALUES ($1, 'intake', 'Client Created From Lead', $2, CURRENT_DATE, $3)`,
        [
          newClientId,
          `${fullName} was converted from Ai-SHA CRM into an active FORGE CSS client.`,
          coachId ?? assignedCoachId,
        ]
      ).catch(() => undefined)

      await client.query(
        `INSERT INTO stage_progressions (client_id, from_stage, to_stage, direction, triggered_by, authorized_by, rationale, effective_date)
         VALUES ($1, NULL, 'foundations', 'initialize', 'coach', $2, $3, CURRENT_DATE)`,
        [newClientId, coachId ?? assignedCoachId, 'Lead conversion initiated client setup in Foundations.']
      ).catch(() => undefined)

      await client.query(
        `INSERT INTO audit_log (user_id, client_id, action, resource_type, resource_id, payload)
         VALUES ($1, $2, 'lead.converted', 'lead', $3, $4::jsonb)`,
        [coachId ?? assignedCoachId, newClientId, lead.id, JSON.stringify({ leadId: lead.id, source: lead.source })]
      ).catch(() => undefined)

      return { success: true, clientId: newClientId, existing: false, alreadyConverted: false }
    })

    if (!result.success || !leadForSideEffects || !result.clientId) {
      return result
    }

    const syncedLead = leadForSideEffects as LeadRow

    if (!existing && !alreadyConverted) {
      try {
        await sendLeadWelcomeEmail({
          clientEmail: syncedLead.email,
          clientName: createdClientName ?? buildLeadName(syncedLead),
          bookingUrl: bookingUrl(),
        })
      } catch (error) {
        console.error('[lead-conversion] failed to send welcome email:', error)
      }
    }

    await markAishaLeadWon(syncedLead, result.clientId)

    return result
  } catch (error) {
    console.error('[lead-conversion] convertLeadToClient failed:', error)
    return { success: false, clientId: createdClientId, existing, alreadyConverted }
  }
}
