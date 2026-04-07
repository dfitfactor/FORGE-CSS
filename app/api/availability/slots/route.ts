import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
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
       WHERE is_booked = false
         AND date >= CURRENT_DATE
       ORDER BY date ASC, start_time ASC`
    )

    return NextResponse.json({ slots })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load availability slots' }, { status: 500 })
  }
}
