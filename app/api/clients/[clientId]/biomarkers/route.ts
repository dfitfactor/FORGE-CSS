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

    const panels = await db.query(
      `SELECT id, panel_date::text, panel_type, lab_name, ordered_by,
              weight_lbs, body_fat_pct, lean_mass_lbs, waist_in, hip_in,
              fasting_glucose, hba1c, insulin, triglycerides, hdl, ldl, total_cholesterol,
              testosterone_total, testosterone_free, estradiol, progesterone, cortisol, dhea_s,
              tsh, t3_free, t4_free,
              crp, homocysteine,
              vitamin_d, b12, ferritin,
              coach_interpretation, flags, created_at::text
       FROM biomarker_panels
       WHERE client_id = $1
       ORDER BY panel_date DESC, created_at DESC`,
      [params.clientId]
    )

    return NextResponse.json({ panels })
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
      panelDate, panelType, labName, orderedBy,
      weightLbs, bodyFatPct, leanMassLbs, waistIn, hipIn,
      fastingGlucose, hba1c, insulin, triglycerides, hdl, ldl, totalCholesterol,
      testosteroneTotal, testosteroneFree, estradiol, progesterone, cortisol, dheaS,
      tsh, t3Free, t4Free,
      crp, homocysteine,
      vitaminD, b12, ferritin,
      coachInterpretation, flags
    } = body

    const result = await db.queryOne<{ id: string }>(
      `INSERT INTO biomarker_panels (
        client_id, created_by, panel_date, panel_type, lab_name, ordered_by,
        weight_lbs, body_fat_pct, lean_mass_lbs, waist_in, hip_in,
        fasting_glucose, hba1c, insulin, triglycerides, hdl, ldl, total_cholesterol,
        testosterone_total, testosterone_free, estradiol, progesterone, cortisol, dhea_s,
        tsh, t3_free, t4_free, crp, homocysteine,
        vitamin_d, b12, ferritin,
        coach_interpretation, flags
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24,
        $25, $26, $27, $28, $29,
        $30, $31, $32, $33, $34
      ) RETURNING id`,
      [
        params.clientId, session.id,
        panelDate || new Date().toISOString().split('T')[0],
        panelType || 'custom', labName || null, orderedBy || null,
        weightLbs || null, bodyFatPct || null, leanMassLbs || null, waistIn || null, hipIn || null,
        fastingGlucose || null, hba1c || null, insulin || null, triglycerides || null,
        hdl || null, ldl || null, totalCholesterol || null,
        testosteroneTotal || null, testosteroneFree || null, estradiol || null,
        progesterone || null, cortisol || null, dheaS || null,
        tsh || null, t3Free || null, t4Free || null, crp || null, homocysteine || null,
        vitaminD || null, b12 || null, ferritin || null,
        coachInterpretation || null, flags || null
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
      `DELETE FROM biomarker_panels WHERE id = $1 AND client_id = $2`,
      [id, params.clientId]
    )

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}