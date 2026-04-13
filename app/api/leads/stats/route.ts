import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireRole } from '@/lib/auth'
import { db } from '@/lib/db'

type StatsRow = {
  total_leads: string
  this_month: string
  this_week: string
  discovery_booked: string
  total_won: string
  total_lost: string
  conversion_rate: string | null
}

export async function GET(request: NextRequest) {
  const session = await getSession(request)

  try {
    requireRole(session, 'coach', 'admin')
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const row = await db.queryOne<StatsRow>(
      `SELECT
         COUNT(*)::text AS total_leads,
         COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now()))::text AS this_month,
         COUNT(*) FILTER (WHERE created_at >= date_trunc('week', now()))::text AS this_week,
         COUNT(*) FILTER (WHERE status = 'discovery_booked')::text AS discovery_booked,
         COUNT(*) FILTER (WHERE status = 'won')::text AS total_won,
         COUNT(*) FILTER (WHERE status = 'lost')::text AS total_lost,
         ROUND(
           COUNT(*) FILTER (WHERE status = 'won')::numeric /
           NULLIF(COUNT(*), 0) * 100, 1
         )::text AS conversion_rate
       FROM leads`
    )

    return NextResponse.json({
      stats: {
        total_leads: Number(row?.total_leads ?? '0'),
        this_month: Number(row?.this_month ?? '0'),
        this_week: Number(row?.this_week ?? '0'),
        discovery_booked: Number(row?.discovery_booked ?? '0'),
        total_won: Number(row?.total_won ?? '0'),
        total_lost: Number(row?.total_lost ?? '0'),
        conversion_rate: Number(row?.conversion_rate ?? '0'),
      },
    })
  } catch (error) {
    console.error('[api/leads/stats] GET error:', error)
    return NextResponse.json({ error: 'Failed to load lead stats' }, { status: 500 })
  }
}
