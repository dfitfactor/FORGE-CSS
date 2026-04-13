import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireRole } from '@/lib/auth'
import { db } from '@/lib/db'
import { convertLeadToClient } from '@/lib/lead-conversion'

export async function POST(request: NextRequest, { params }: { params: { leadId: string } }) {
  const session = await getSession(request)
  let actor

  try {
    actor = requireRole(session, 'coach', 'admin')
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    await db.query(
      `UPDATE leads
       SET status = 'won',
           updated_at = NOW()
       WHERE id = $1
         AND status != 'won'`,
      [params.leadId]
    )

    const result = await convertLeadToClient(params.leadId, actor.id)
    if (!result.success) {
      return NextResponse.json({ error: 'Failed to convert lead' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      clientId: result.clientId,
      existing: result.existing,
      alreadyConverted: result.alreadyConverted ?? false,
    })
  } catch (error) {
    console.error('[api/leads/[leadId]/convert] POST error:', error)
    return NextResponse.json({ error: 'Failed to convert lead' }, { status: 500 })
  }
}
