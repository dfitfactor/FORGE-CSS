import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { canAccessClient, getSession, requireRole } from '@/lib/auth'
import { db } from '@/lib/db'
import { buildCycleDates } from '@/lib/subscriptions'

const createEnrollmentSchema = z.object({
  packageId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sessionsPerWeek: z.number().int().min(1).max(31).optional(),
  amountCents: z.number().int().min(0).optional(),
})

type ClientRow = {
  id: string
  coach_id: string
}

type PackageRow = {
  id: string
  name: string
  session_count: number | string | null
  price_cents: number | string | null
  billing_type: string | null
  billing_period_months: number | string | null
}

type ExistingEnrollmentRow = {
  id: string
}

const columnCache = new Map<string, Set<string>>()

function toNumber(value: number | string | null | undefined, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

async function getColumnSet(tableName: string) {
  const cached = columnCache.get(tableName)
  if (cached) return cached

  const rows = await db.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = $1`,
    [tableName]
  )

  const columns = new Set(rows.map((row) => row.column_name))
  columnCache.set(tableName, columns)
  return columns
}

export async function POST(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  const session = await getSession(request)
  try {
    requireRole(session, 'coach', 'admin')
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const parsed = createEnrollmentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const client = await db.queryOne<ClientRow>(
      `SELECT id, coach_id
       FROM clients
       WHERE id = $1
       LIMIT 1`,
      [params.clientId]
    )

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    if (!canAccessClient(session!, client.coach_id)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const activeEnrollment = await db.queryOne<ExistingEnrollmentRow>(
      `SELECT id
       FROM package_enrollments
       WHERE client_id = $1
         AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [params.clientId]
    )

    if (activeEnrollment) {
      return NextResponse.json(
        { error: 'Client already has an active package enrollment', enrollmentId: activeEnrollment.id },
        { status: 409 }
      )
    }

    const pkg = await db.queryOne<PackageRow>(
      `SELECT id, name, session_count, price_cents, billing_type, billing_period_months
       FROM packages
       WHERE id = $1
         AND is_active = true
       LIMIT 1`,
      [parsed.data.packageId]
    )

    if (!pkg) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 })
    }

    const sessionTotal = Math.max(0, toNumber(pkg.session_count))
    const sessionsPerWeek = parsed.data.sessionsPerWeek ?? 1
    const amountCents = parsed.data.amountCents ?? toNumber(pkg.price_cents)
    const monthlyLimit = Math.max(sessionTotal, 0)
    const anchorDate = parsed.data.startDate
      ? new Date(`${parsed.data.startDate}T12:00:00.000Z`)
      : new Date()
    const cycleDates = buildCycleDates(anchorDate)
    const columns = await getColumnSet('package_enrollments')

    const insertColumns: string[] = []
    const insertValues: unknown[] = []

    const pushValue = (column: string, value: unknown) => {
      if (!columns.has(column)) return
      insertColumns.push(column)
      insertValues.push(value)
    }

    pushValue('client_id', params.clientId)
    pushValue('package_id', parsed.data.packageId)
    pushValue('sessions_total', sessionTotal)
    pushValue('sessions_remaining', sessionTotal)
    pushValue('sessions_per_week', sessionsPerWeek)
    pushValue('weekly_limit', sessionsPerWeek)
    pushValue('monthly_limit', monthlyLimit)
    pushValue('amount_cents', amountCents)
    pushValue('billing_type', pkg.billing_type ?? 'monthly')
    pushValue('payment_status', 'paid')
    pushValue('status', 'active')
    pushValue('subscription_status', 'active')
    pushValue('billing_cycle_start', cycleDates.billingCycleStart)
    pushValue('billing_cycle_end', cycleDates.billingCycleEnd)
    pushValue('sessions_expire_at', cycleDates.sessionsExpireAt)
    pushValue('last_renewed_at', cycleDates.renewedAt)
    pushValue('next_renewal_at', cycleDates.nextRenewalAt)
    pushValue('start_date', parsed.data.startDate ?? cycleDates.billingCycleStart)

    if (insertColumns.length === 0) {
      return NextResponse.json({ error: 'Package enrollment schema is unavailable' }, { status: 500 })
    }

    const placeholders = insertColumns.map((_, index) => `$${index + 1}`)
    const enrollment = await db.queryOne<{ id: string }>(
      `INSERT INTO package_enrollments (${insertColumns.join(', ')})
       VALUES (${placeholders.join(', ')})
       RETURNING id`,
      insertValues
    )

    if (!enrollment?.id) {
      return NextResponse.json({ error: 'Failed to create package enrollment' }, { status: 500 })
    }

    return NextResponse.json({
      enrollmentId: enrollment.id,
      package: {
        id: pkg.id,
        name: pkg.name,
        billingType: pkg.billing_type,
      },
    }, { status: 201 })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create package enrollment' },
      { status: 500 }
    )
  }
}
