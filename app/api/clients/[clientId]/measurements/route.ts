import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const client = await db.queryOne<{ coach_id: string }>(
      `SELECT coach_id FROM clients WHERE id = $1`, [params.clientId]
    )
    if (!client || (client.coach_id !== session.id && session.role !== 'admin')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const measurements = await db.query<{
      id: string
      measurement_date: string
      height_in: number | null
      weight_lbs: number | null
      body_fat_pct: number | null
      lean_mass_lbs: number | null
      waist_in: number | null
      hips_in: number | null
      chest_in: number | null
      left_arm_in: number | null
      right_arm_in: number | null
      left_thigh_in: number | null
      right_thigh_in: number | null
      notes: string | null
    }>(
      `SELECT id, measurement_date::text, height_in, weight_lbs, body_fat_pct, lean_mass_lbs,
              waist_in, hips_in, chest_in, left_arm_in, right_arm_in,
              left_thigh_in, right_thigh_in, notes
       FROM client_measurements
       WHERE client_id = $1
       ORDER BY measurement_date DESC, created_at DESC`,
      [params.clientId]
    )

    return NextResponse.json({ measurements })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const client = await db.queryOne<{ coach_id: string }>(
      `SELECT coach_id FROM clients WHERE id = $1`, [params.clientId]
    )
    if (!client || (client.coach_id !== session.id && session.role !== 'admin')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const body = await request.json()
    const {
      measurementDate, heightIn, weightLbs, bodyFatPct, leanMassLbs,
      waistIn, hipsIn, chestIn, leftArmIn, rightArmIn,
      leftThighIn, rightThighIn, notes
    } = body

    const result = await db.queryOne<{ id: string }>(
      `INSERT INTO client_measurements
         (client_id, logged_by, measurement_date, height_in, weight_lbs, body_fat_pct, lean_mass_lbs,
          waist_in, hips_in, chest_in, left_arm_in, right_arm_in,
          left_thigh_in, right_thigh_in, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id`,
      [
        params.clientId, session.id,
        measurementDate || new Date().toISOString().split('T')[0],
        heightIn || null, weightLbs || null, bodyFatPct || null, leanMassLbs || null,
        waistIn || null, hipsIn || null, chestIn || null,
        leftArmIn || null, rightArmIn || null,
        leftThighIn || null, rightThighIn || null,
        notes || null
      ]
    )

    return NextResponse.json({ success: true, id: result?.id })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
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

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    const client = await db.queryOne<{ coach_id: string }>(
      `SELECT coach_id FROM clients WHERE id = $1`, [params.clientId]
    )
    if (!client || (client.coach_id !== session.id && session.role !== 'admin')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    await db.query(
      `DELETE FROM client_measurements WHERE id = $1 AND client_id = $2`,
      [id, params.clientId]
    )

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}