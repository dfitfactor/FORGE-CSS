import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { overrideForfeiture } from '@/lib/session-bank'

const overrideSchema = z.object({
  entitlementId: z.string().uuid(),
  overrideReason: z.string().trim().min(5),
})

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = overrideSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    await overrideForfeiture(parsed.data.entitlementId, session.id, parsed.data.overrideReason)
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to override forfeiture' }, { status: 500 })
  }
}
