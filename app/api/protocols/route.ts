import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { createProtocolVersion } from '@/services/protocol-engine'
import { computeGenerationState } from '@/lib/bie-engine'
import { z } from 'zod'

const GenerateProtocolSchema = z.object({
  clientId: z.string().uuid(),
  protocolType: z.enum(['movement', 'nutrition', 'recovery', 'accountability', 'composite']),
  useAI: z.boolean().default(true),
  equipmentAvailable: z.array(z.string()).optional(),
  coachDirectives: z.string().optional(),
  manualPayload: z.record(z.unknown()).optional(),
})

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = GenerateProtocolSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  const { clientId, protocolType, useAI, equipmentAvailable, coachDirectives, manualPayload } = parsed.data

  // Verify coach access
  const client = await db.queryOne<{ id: string; current_stage: string; coach_id: string }>(
    `SELECT id, current_stage, coach_id FROM clients WHERE id = $1`,
    [clientId]
  )
  if (!client || (client.coach_id !== session.id && session.role !== 'admin')) {
    return NextResponse.json({ error: 'Client not found or access denied' }, { status: 404 })
  }

  // Get latest BIE snapshot
  const snapshot = await db.queryOne<{
    bar: number; bli: number; dbi: number; cdi: number
    lsi: number; c_lsi: number; pps: number
  }>(
    `SELECT bar, bli, dbi, cdi, lsi, c_lsi, pps
     FROM behavioral_snapshots WHERE client_id = $1
     ORDER BY snapshot_date DESC LIMIT 1`,
    [clientId]
  )

  const bieVars = snapshot ? {
    bar: Number(snapshot.bar) || 50,
    bli: Number(snapshot.bli) || 50,
    dbi: Number(snapshot.dbi) || 50,
    cdi: Number(snapshot.cdi) || 50,
    lsi: Number(snapshot.lsi) || 50,
    cLsi: Number(snapshot.c_lsi) || 50,
    pps: Number(snapshot.pps) || 50,
  } : {
    bar: 50, bli: 50, dbi: 50, cdi: 50, lsi: 50, cLsi: 50, pps: 50
  }

  const { state: generationState } = computeGenerationState(bieVars)

  try {
    const result = await createProtocolVersion({
      clientId,
      coachId: session.id,
      protocolType,
      stage: client.current_stage as any,
      generationState,
      bieVars,
      useAI,
      equipmentAvailable,
      coachDirectives,
      manualPayload,
    })

    // Audit log
    await db.query(
      `INSERT INTO audit_log (user_id, client_id, action, resource_type, resource_id, payload)
       VALUES ($1, $2, 'protocol.generated', 'protocol', $3, $4)`,
      [session.id, clientId, result.protocolId, JSON.stringify({ protocolType, version: result.version, useAI })]
    )

    return NextResponse.json({
      protocolId: result.protocolId,
      version: result.version,
      generatedProtocol: result.generatedProtocol,
    }, { status: 201 })

  } catch (err) {
    console.error('Protocol generation error:', err)
    return NextResponse.json(
      { error: 'Protocol generation failed', details: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('clientId')
  const activeOnly = searchParams.get('activeOnly') !== 'false'

  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  // Verify access
  const client = await db.queryOne<{ coach_id: string }>(
    `SELECT coach_id FROM clients WHERE id = $1`, [clientId]
  )
  if (!client || (client.coach_id !== session.id && session.role !== 'admin')) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const protocols = await db.query(
    `SELECT p.*, u.full_name as generated_by_name
     FROM protocols p
     LEFT JOIN users u ON u.id = p.generated_by_user
     WHERE p.client_id = $1 ${activeOnly ? 'AND p.is_active = true' : ''}
     ORDER BY p.protocol_type, p.version DESC`,
    [clientId]
  )

  return NextResponse.json({ protocols })
}
