import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const UpdateClientSchema = z.object({
  fullName: z.string().min(1).max(255).optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional(),
  primaryGoal: z.string().optional(),
  motivation: z.string().optional(),
  obstacles: z.string().optional(),
  weightLbs: z.number().optional(),
  bodyFatPct: z.number().optional(),
  injuries: z.array(z.string()).optional(),
  programTier: z.enum(['forge_lite', 'forge_core', 'forge_elite']).optional(),
  sessionsPerMonth: z.number().optional(),
  targetSessionsPerWeek: z.number().min(1).max(7).optional(),
  availableEquipment: z.array(z.string()).optional(),
  status: z.enum(['active', 'paused', 'graduated', 'churned']).optional(),
  notes: z.string().optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const client = await db.queryOne(
      `SELECT c.*,
         c.intake_date::text as intake_date,
         c.date_of_birth::text as date_of_birth,
         c.stage_entered_at::text as stage_entered_at,
         c.created_at::text as created_at,
         c.updated_at::text as updated_at
       FROM clients c
       WHERE c.id = $1`,
      [params.clientId]
    ) as Record<string, unknown> | null

    if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Enforce coach_id only if present in this schema.
    if (typeof (client as any).coach_id === 'string' && (client as any).coach_id !== session.id && session.role !== 'admin') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const snapshot = await (async () => {
      try {
        return await db.queryOne(
          `SELECT id, client_id, snapshot_date::text as snapshot_date,
                  bar_score as bar, bli_score as bli, dbi_score as dbi, cdi, lsi, c_lsi, pps,
                  generation_state, generation_state_label,
                  coach_override, override_notes, updated_at::text as created_at
           FROM behavioral_snapshots WHERE client_id = $1
           ORDER BY snapshot_date DESC LIMIT 1`,
          [params.clientId]
        )
      } catch {
        try {
          return await db.queryOne(
            `SELECT id, client_id, snapshot_date::text as snapshot_date,
                    bar, bli, dbi, cdi, lsi, c_lsi, pps,
                    generation_state, generation_state_label,
                    coach_override, override_notes, created_at::text as created_at
             FROM behavioral_snapshots WHERE client_id = $1
             ORDER BY snapshot_date DESC LIMIT 1`,
            [params.clientId]
          )
        } catch {
          // If staging schema differs enough that *both* query variants fail,
          // return null so edit page can load.
          return null
        }
      }
    })()

    return NextResponse.json({ client, latestSnapshot: snapshot })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const existing = await db.queryOne<{ coach_id: string }>(
      `SELECT coach_id FROM clients WHERE id = $1`, [params.clientId]
    )
    if (!existing || (existing.coach_id !== session.id && session.role !== 'admin')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = UpdateClientSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten() }, { status: 400 })
    }

    // Some staging environments may have a different `clients` schema.
    // Only update columns that exist to avoid hard 500s.
    const existingColumns = await db.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'clients'`
    )
    const colSet = new Set(existingColumns.map(c => c.column_name))

    const updates: string[] = []
    const values: unknown[] = []
    let idx = 1

    const fieldMap: Record<string, string> = {
      fullName: 'full_name', email: 'email', phone: 'phone',
      dateOfBirth: 'date_of_birth',
      primaryGoal: 'primary_goal', motivation: 'motivation', obstacles: 'obstacles',
      weightLbs: 'weight_lbs', bodyFatPct: 'body_fat_pct',
      injuries: 'injuries', programTier: 'program_tier',
      sessionsPerMonth: 'sessions_per_month',
      targetSessionsPerWeek: 'sessions_per_week',
      availableEquipment: 'available_equipment',
      status: 'status', notes: 'notes',
    }

    for (const [key, dbCol] of Object.entries(fieldMap)) {
      if (key in parsed.data) {
        // Skip missing columns on staging.
        if (!colSet.has(dbCol)) continue
        updates.push(`${dbCol} = $${idx}`)
        values.push(parsed.data[key as keyof typeof parsed.data])
        idx++
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    if (colSet.has('updated_at')) {
      updates.push(`updated_at = NOW()`)
    }
    values.push(params.clientId)

    await db.query(
      `UPDATE clients SET ${updates.join(', ')} WHERE id = $${idx}`,
      values
    )

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const existing = await db.queryOne<{ coach_id: string }>(
      `SELECT coach_id FROM clients WHERE id = $1`,
      [params.clientId]
    )

    if (!existing || (existing.coach_id !== session.id && session.role !== 'admin')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    await db.query(
      `UPDATE clients
       SET status = 'churned',
           updated_at = NOW()
       WHERE id = $1`,
      [params.clientId]
    )

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
