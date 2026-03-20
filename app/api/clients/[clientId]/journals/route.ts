import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

async function getJournalEntries(clientId: string) {
  try {
    return await db.query(
      `SELECT id, entry_date::text, entry_type, title, body,
              sleep_hours, sleep_quality, stress_level, energy_level,
              hunger_level, mood, digestion_quality,
              travel_flag, illness_flag, work_stress_flag, family_stress_flag,
              extracted_signals, signals_extracted,
              coach_response, is_private, created_at::text
       FROM journal_entries
       WHERE client_id = $1
       ORDER BY entry_date ASC, created_at ASC
       LIMIT 100`,
      [clientId]
    )
  } catch {
    return db.query(
      `SELECT id, entry_date::text, entry_type, title, body,
              sleep_hours, sleep_quality, stress_level, energy_level,
              hunger_level, mood, digestion_quality,
              travel_flag, illness_flag, work_stress_flag, family_stress_flag,
              NULL::jsonb AS extracted_signals,
              false AS signals_extracted,
              coach_response, is_private, created_at::text
       FROM journal_entries
       WHERE client_id = $1
       ORDER BY entry_date ASC, created_at ASC
       LIMIT 100`,
      [clientId]
    )
  }
}

async function getJournalEntryById(id: string) {
  try {
    return await db.queryOne(
      `SELECT id, entry_date::text, entry_type, title, body,
              sleep_hours, sleep_quality, stress_level, energy_level,
              hunger_level, mood, digestion_quality,
              travel_flag, illness_flag, work_stress_flag, family_stress_flag,
              extracted_signals, signals_extracted,
              coach_response, is_private, created_at::text
       FROM journal_entries
       WHERE id = $1`,
      [id]
    )
  } catch {
    return db.queryOne(
      `SELECT id, entry_date::text, entry_type, title, body,
              sleep_hours, sleep_quality, stress_level, energy_level,
              hunger_level, mood, digestion_quality,
              travel_flag, illness_flag, work_stress_flag, family_stress_flag,
              NULL::jsonb AS extracted_signals,
              false AS signals_extracted,
              coach_response, is_private, created_at::text
       FROM journal_entries
       WHERE id = $1`,
      [id]
    )
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // TEMP DEBUG
    console.log('[TEMP DEBUG][journals][GET] request', {
      clientId: params.clientId,
      userId: session.id,
      role: session.role,
    })
    const client = await db.queryOne<{ coach_id: string }>(
      `SELECT coach_id FROM clients WHERE id = $1`, [params.clientId]
    )
    if (!client || (client.coach_id !== session.id && session.role !== 'admin')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    const entries = await getJournalEntries(params.clientId)
    const debug = {
      clientId: params.clientId,
      rowCount: entries.length,
      firstEntryId: (entries[0] as { id?: string } | undefined)?.id ?? null,
      firstEntryDate: (entries[0] as { entry_date?: string } | undefined)?.entry_date ?? null,
    }
    // TEMP DEBUG
    console.log('[TEMP DEBUG][journals][GET] result', debug)
    return NextResponse.json({ entries, debug })
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
    // TEMP DEBUG
    console.log('[TEMP DEBUG][journals][POST] request', {
      clientId: params.clientId,
      userId: session.id,
      role: session.role,
    })
    const client = await db.queryOne<{ coach_id: string }>(
      `SELECT coach_id FROM clients WHERE id = $1`, [params.clientId]
    )
    if (!client || (client.coach_id !== session.id && session.role !== 'admin')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    const body = await request.json()
    const result = await db.queryOne<{ id: string }>(
      `INSERT INTO journal_entries (
        client_id, entry_date, entry_type, title, body,
        sleep_hours, sleep_quality, stress_level, energy_level,
        hunger_level, mood, digestion_quality,
        travel_flag, illness_flag, work_stress_flag, family_stress_flag,
        coach_response, is_private
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING id`,
      [
        params.clientId,
        body.entryDate || new Date().toISOString().split('T')[0],
        body.entryType || 'daily_log',
        body.title || null,
        body.body || null,
        body.sleepHours || null,
        body.sleepQuality || null,
        body.stressLevel || null,
        body.energyLevel || null,
        body.hungerLevel || null,
        body.mood || null,
        body.digestionQuality || null,
        body.travelFlag || false,
        body.illnessFlag || false,
        body.workStressFlag || false,
        body.familyStressFlag || false,
        body.coachResponse || null,
        body.isPrivate || false,
      ]
    )
    if (!result?.id) {
      return NextResponse.json({ error: 'Failed to create journal entry' }, { status: 500 })
    }
    // TEMP DEBUG
    console.log('[TEMP DEBUG][journals][POST] inserted', {
      clientId: params.clientId,
      insertedId: result.id,
    })

    const entry = await getJournalEntryById(result.id)
    const countRow = await db.queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM journal_entries
       WHERE client_id = $1`,
      [params.clientId]
    )
    const debug = {
      clientId: params.clientId,
      insertedId: result.id,
      clientJournalCount: Number(countRow?.count ?? 0),
    }
    // TEMP DEBUG
    console.log('[TEMP DEBUG][journals][POST] result', debug)

    return NextResponse.json({ success: true, id: result.id, entry, debug })
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
    await db.query(
      `DELETE FROM journal_entries WHERE id = $1 AND client_id = $2`,
      [id, params.clientId]
    )
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
