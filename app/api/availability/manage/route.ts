import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSession, requireRole } from '@/lib/auth'

const slotSchema = z.object({
  coach_id: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  id: z.string().uuid().optional(),
})

function normalizeTime(value: string) {
  return value.length === 5 ? `${value}:00` : value
}

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  requireRole(session, 'coach', 'admin')

  try {
    const slots = await db.query(
      `SELECT id,
              coach_id,
              date::text AS date,
              start_time::text AS start_time,
              end_time::text AS end_time,
              is_booked,
              created_at
       FROM coach_availability
       ORDER BY date ASC, start_time ASC`
    )

    return NextResponse.json({ slots })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load coach availability' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  requireRole(session, 'coach', 'admin')

  const body = await request.json().catch(() => null)
  const parsed = slotSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const slot = await db.queryOne(
      `INSERT INTO coach_availability (coach_id, date, start_time, end_time)
       VALUES ($1, $2::date, $3::time, $4::time)
       RETURNING id,
                 coach_id,
                 date::text AS date,
                 start_time::text AS start_time,
                 end_time::text AS end_time,
                 is_booked,
                 created_at`,
      [
        parsed.data.coach_id ?? session.id,
        parsed.data.date,
        normalizeTime(parsed.data.start_time),
        normalizeTime(parsed.data.end_time),
      ]
    )

    return NextResponse.json({ slot }, { status: 201 })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create slot' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  requireRole(session, 'coach', 'admin')

  const body = await request.json().catch(() => null)
  const parsed = slotSchema.pick({ id: true }).safeParse(body)
  if (!parsed.success || !parsed.data.id) {
    return NextResponse.json({ error: 'Slot id is required' }, { status: 400 })
  }

  try {
    const result = await db.queryOne(
      `DELETE FROM coach_availability
       WHERE id = $1
         AND is_booked = false
       RETURNING id`,
      [parsed.data.id]
    )

    if (!result) {
      return NextResponse.json({ error: 'Slot not found or already booked' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to delete slot' }, { status: 500 })
  }
}


