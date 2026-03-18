import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const CreateClientSchema = z.object({
  fullName: z.string().min(1).max(255),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  primaryGoal: z.string().optional(),
  secondaryGoals: z.array(z.string()).optional(),
  motivation: z.string().optional(),
  obstacles: z.string().optional(),
  currentActivityLevel: z.string().optional(),
  fitnessExperience: z.string().optional(),
  heightIn: z.number().optional(),
  weightLbs: z.number().optional(),
  bodyFatPct: z.number().optional(),
  injuries: z.array(z.string()).optional(),
  medicalConditions: z.array(z.string()).optional(),
  medications: z.array(z.string()).optional(),
  physicianClearance: z.boolean().optional(),
  programTier: z.enum(['forge_lite', 'forge_core', 'forge_elite']).optional(),
  sessionsPerMonth: z.number().optional(),
  notes: z.string().optional(),
})

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Staging schemas may differ (legacy snapshots vs Neon snapshots). Try Neon-style columns first,
    // then fall back to legacy columns while keeping the same response shape.
    let clients: any[] = []
    try {
      clients = await db.query(
        `SELECT 
          c.id,
          c.full_name,
          c.email,
          c.status,
          c.primary_goal,
          c.current_stage,
          CAST(bs.bar_score AS FLOAT) AS bar_score,
          CAST(bs.dbi_score AS FLOAT) AS dbi_score,
          CAST(bs.bli_score AS FLOAT) AS bli_score,
          bs.updated_at AS snapshot_updated_at,
          (
            SELECT MAX(created_at) 
            FROM adherence_records ar 
            WHERE ar.client_id = c.id
          ) AS last_session
        FROM clients c
        LEFT JOIN behavioral_snapshots bs ON bs.client_id = c.id
        ORDER BY bs.updated_at DESC NULLS LAST`
      )
    } catch {
      clients = await db.query(
        `SELECT 
          c.id,
          c.full_name,
          c.email,
          c.status,
          c.primary_goal,
          c.current_stage,
          CAST(bs.bar AS FLOAT) AS bar_score,
          CAST(bs.dbi AS FLOAT) AS dbi_score,
          CAST(COALESCE(bs.bli, 0) AS FLOAT) AS bli_score,
          bs.created_at AS snapshot_updated_at,
          (
            SELECT MAX(created_at) 
            FROM adherence_records ar 
            WHERE ar.client_id = c.id
          ) AS last_session
        FROM clients c
        LEFT JOIN behavioral_snapshots bs ON bs.client_id = c.id
        ORDER BY bs.created_at DESC NULLS LAST`
      )
    }

    return NextResponse.json(clients)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.role !== 'coach' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = CreateClientSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data

  const client = await db.queryOne<{ id: string }>(
    `INSERT INTO clients (
      coach_id, full_name, email, phone, date_of_birth, gender,
      primary_goal, secondary_goals, motivation, obstacles,
      current_activity_level, fitness_experience,
      height_in, weight_lbs, body_fat_pct,
      injuries, medical_conditions, medications, physician_clearance,
      program_tier, sessions_per_month, notes,
      current_stage, intake_date, status
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10,
      $11, $12,
      $13, $14, $15,
      $16, $17, $18, $19,
      $20, $21, $22,
      'foundations', CURRENT_DATE, 'active'
    ) RETURNING id`,
    [
      session.id, data.fullName, data.email || null, data.phone || null,
      data.dateOfBirth || null, data.gender || null,
      data.primaryGoal || null, data.secondaryGoals || [],
      data.motivation || null, data.obstacles || null,
      data.currentActivityLevel || null, data.fitnessExperience || null,
      data.heightIn || null, data.weightLbs || null, data.bodyFatPct || null,
      data.injuries || [], data.medicalConditions || [], data.medications || [],
      data.physicianClearance || false,
      data.programTier || null, data.sessionsPerMonth || null, data.notes || null,
    ]
  )

  if (!client) {
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 })
  }

  // Create intake timeline event
  await db.query(
    `INSERT INTO timeline_events (client_id, event_type, title, description, event_date, created_by)
     VALUES ($1, 'intake', 'Client Intake Completed', $2, CURRENT_DATE, $3)`,
    [client.id, `${data.fullName} joined FORGE at the Foundations stage.`, session.id]
  )

  // Create initial stage progression
  await db.query(
    `INSERT INTO stage_progressions (client_id, from_stage, to_stage, direction, triggered_by, authorized_by, rationale, effective_date)
     VALUES ($1, NULL, 'foundations', 'initialize', 'coach', $2, 'Client intake â€” starting Foundations stage.', CURRENT_DATE)`,
    [client.id, session.id]
  )

  // Audit log
  await db.query(
    `INSERT INTO audit_log (user_id, client_id, action, resource_type, resource_id)
     VALUES ($1, $2, 'client.created', 'client', $2)`,
    [session.id, client.id]
  )

  return NextResponse.json({ clientId: client.id }, { status: 201 })
}
