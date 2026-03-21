import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const [services, packages] = await Promise.all([
      db.query(
        `SELECT *
         FROM services
         WHERE is_public = true AND is_active = true
         ORDER BY sort_order NULLS LAST, name ASC`
      ),
      db.query(
        `SELECT *
         FROM packages
         WHERE is_public = true AND is_active = true
         ORDER BY forge_stage ASC, sort_order NULLS LAST, name ASC`
      ),
    ])

    return NextResponse.json({ services, packages })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load booking options' }, { status: 500 })
  }
}
