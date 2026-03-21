import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  loadMovementWorkspace,
  revertProtocolOverride,
  saveMovementExecutionLog,
  saveProtocolOverride,
} from '@/lib/protocol-workspaces'

async function authorize(clientId: string, request: NextRequest) {
  const session = await getSession(request)
  if (!session) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const client = await db.queryOne<{ coach_id: string }>(
    `SELECT coach_id FROM clients WHERE id = $1`,
    [clientId]
  )

  if (!client || (client.coach_id !== session.id && session.role !== 'admin')) {
    return { error: NextResponse.json({ error: 'Access denied' }, { status: 403 }) }
  }

  return { session }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const auth = await authorize(params.clientId, request)
    if (auth.error) return auth.error

    const workspace = await loadMovementWorkspace(params.clientId)
    return NextResponse.json(workspace)
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const auth = await authorize(params.clientId, request)
    if (auth.error) return auth.error

    const body = await request.json()

    if (body.action === 'log_execution') {
      if (!body.protocolId || !body.exerciseId || !body.exerciseName) {
        return NextResponse.json({ error: 'Protocol and exercise details are required' }, { status: 400 })
      }

      await saveMovementExecutionLog({
        clientId: params.clientId,
        protocolId: String(body.protocolId),
        exerciseId: String(body.exerciseId),
        exerciseName: String(body.exerciseName),
        completedSessions: typeof body.completedSessions === 'number' ? body.completedSessions : null,
        completedSets: typeof body.completedSets === 'number' ? body.completedSets : null,
        completedReps: typeof body.completedReps === 'string' ? body.completedReps : null,
        load: typeof body.load === 'string' ? body.load : null,
        notes: typeof body.notes === 'string' ? body.notes : null,
        createdBy: auth.session.id,
      })
    } else if (body.action === 'add_override') {
      if (!body.protocolId || !body.target || !body.reason || !body.change || typeof body.change !== 'object') {
        return NextResponse.json({ error: 'Override target, change, and reason are required' }, { status: 400 })
      }

      await saveProtocolOverride({
        clientId: params.clientId,
        protocolId: String(body.protocolId),
        section: 'movement',
        target: String(body.target),
        change: body.change as Record<string, unknown>,
        reason: String(body.reason),
        createdBy: auth.session.id,
      })
    } else if (body.action === 'revert_override') {
      if (!body.protocolId || !body.overrideId) {
        return NextResponse.json({ error: 'Protocol and override ids are required' }, { status: 400 })
      }

      await revertProtocolOverride({
        clientId: params.clientId,
        protocolId: String(body.protocolId),
        section: 'movement',
        overrideId: String(body.overrideId),
        revertedBy: auth.session.id,
        reason: typeof body.reason === 'string' ? body.reason : null,
      })
    } else {
      return NextResponse.json({ error: 'Unsupported movement action' }, { status: 400 })
    }

    const workspace = await loadMovementWorkspace(params.clientId)
    return NextResponse.json({ success: true, workspace })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
