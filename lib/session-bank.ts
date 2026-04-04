import { PoolClient } from 'pg'
import { db } from '@/lib/db'

export interface SessionBankStatus {
  enrollmentId: string
  billingPeriod: string
  allotted: number
  used: number
  forfeited: number
  returned: number
  remaining: number
  graceExpires: string | null
  isOnHold: boolean
  holdUntil: string | null
  weeklyUsed: number
  weeklyLimit: number
  canBook: boolean
  cannotBookReason: string | null
}

type SessionBankRow = {
  id: string
  enrollment_id: string
  client_id: string
  billing_period: string
  sessions_allotted: number | string | null
  sessions_remaining: number | string | null
  sessions_used: number | string | null
  sessions_forfeited: number | string | null
  sessions_returned: number | string | null
  grace_period_expires: string | null
  status: string
  is_frozen?: boolean | null
  hold_id?: string | null
}

type EnrollmentRow = {
  id: string
  client_id: string
  package_id?: string | null
  sessions_total: number | string | null
  sessions_per_week: number | string | null
  sessions_used?: number | string | null
  sessions_forfeited?: number | string | null
  sessions_remaining?: number | string | null
  is_on_hold?: boolean | null
  hold_start?: string | null
  hold_end?: string | null
  status: string
}

type HoldRow = {
  id: string
  start_date: string
  end_date: string
  hold_type: string
  status: string
}

type EntitlementRow = {
  id: string
  booking_id: string
  enrollment_id: string
  session_bank_id: string | null
  status: string
  entitlement_type: 'standard' | 'makeup' | 'grace' | 'override'
}

const SUPERUSER_EMAIL = 'coach@dfitfactor.com'

function formatDateOnly(value: Date) {
  const year = value.getFullYear()
  const month = `${value.getMonth() + 1}`.padStart(2, '0')
  const day = `${value.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfCurrentMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function startOfWeek(date: Date) {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  const day = copy.getDay()
  copy.setDate(copy.getDate() - day)
  return copy
}

function endOfWeek(date: Date) {
  const start = startOfWeek(date)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return end
}

function nextWeekStart(date: Date) {
  return formatDateOnly(endOfWeek(date))
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) return 0
  const next = Number(value)
  return Number.isFinite(next) ? next : 0
}

async function isAdminUser(userId: string) {
  const [user, adminRole] = await Promise.all([
    db.queryOne<{ email: string | null }>('SELECT email FROM users WHERE id = $1', [userId]),
    db.queryOne<{ role: string }>(
      `SELECT role FROM admin_roles
       WHERE user_id = $1 AND is_active = true
       LIMIT 1`,
      [userId]
    ),
  ])

  return user?.email?.toLowerCase() === SUPERUSER_EMAIL || Boolean(adminRole)
}

async function getEnrollment(enrollmentId: string) {
  return db.queryOne<EnrollmentRow>(
    `SELECT *
     FROM package_enrollments
     WHERE id = $1`,
    [enrollmentId]
  )
}

async function getActiveHold(enrollmentId: string, onDate = new Date()) {
  return db.queryOne<HoldRow>(
    `SELECT id, start_date::text, end_date::text, hold_type, status
     FROM membership_holds
     WHERE enrollment_id = $1
       AND status IN ('approved', 'active')
       AND start_date <= $2::date
       AND end_date >= $2::date
     ORDER BY start_date DESC
     LIMIT 1`,
    [enrollmentId, formatDateOnly(onDate)]
  )
}

async function getCurrentBank(enrollmentId: string) {
  const billingPeriod = formatDateOnly(startOfCurrentMonth())
  return db.queryOne<SessionBankRow>(
    `SELECT *
     FROM session_bank
     WHERE enrollment_id = $1 AND billing_period = $2
     LIMIT 1`,
    [enrollmentId, billingPeriod]
  )
}

async function getPreviousGraceBank(enrollmentId: string, onDate = new Date()) {
  return db.queryOne<SessionBankRow>(
    `SELECT *
     FROM session_bank
     WHERE enrollment_id = $1
       AND billing_period < $2
       AND grace_period_expires >= $3
       AND sessions_remaining > 0
       AND status = 'active'
     ORDER BY billing_period DESC
     LIMIT 1`,
    [enrollmentId, formatDateOnly(startOfCurrentMonth(onDate)), onDate.toISOString()]
  )
}

async function countWeeklyUsage(enrollmentId: string, proposedDate: Date) {
  const weekStart = formatDateOnly(startOfWeek(proposedDate))
  const weekEnd = formatDateOnly(endOfWeek(proposedDate))

  const result = await db.queryOne<{ count: string | number }>(
    `SELECT COUNT(*) AS count
     FROM bookings b
     LEFT JOIN session_entitlements se ON se.id = b.entitlement_id
     WHERE b.enrollment_id = $1
       AND b.booking_date >= $2::date
       AND b.booking_date < $3::date
       AND b.status NOT IN ('cancelled', 'no_show')
       AND COALESCE(se.status, 'consumed') NOT IN ('forfeited', 'returned', 'expired')`,
    [enrollmentId, weekStart, weekEnd]
  )

  return toNumber(result?.count)
}

async function getBookableBank(enrollmentId: string, clientId: string, proposedDate = new Date()) {
  const currentBank = await getOrCreateSessionBank(enrollmentId, clientId)
  if (currentBank.remaining > 0) {
    return { bankId: currentBank.id, entitlementType: 'standard' as const }
  }

  const previousGraceBank = await getPreviousGraceBank(enrollmentId, proposedDate)
  if (previousGraceBank && toNumber(previousGraceBank.sessions_remaining) > 0) {
    return { bankId: previousGraceBank.id, entitlementType: 'grace' as const }
  }

  return null
}

async function freezeSessionBank(
  enrollmentId: string,
  holdId: string,
  reason: string,
  client?: PoolClient
): Promise<void> {
  const executor = client ?? { query: (sql: string, params?: unknown[]) => db.query(sql, params) }
  const billingPeriod = formatDateOnly(startOfCurrentMonth())

  await executor.query(
    `UPDATE session_bank
     SET is_frozen = true,
         frozen_at = NOW(),
         freeze_reason = $3,
         hold_id = $2,
         grace_period_expires = grace_period_expires + COALESCE((
           SELECT ((end_date - start_date) || ' days')::interval
           FROM membership_holds
           WHERE id = $2
         ), INTERVAL '0 days')
     WHERE enrollment_id = $1
       AND billing_period = $4`,
    [enrollmentId, holdId, reason, billingPeriod]
  )
}

export async function getOrCreateSessionBank(
  enrollmentId: string,
  clientId: string
): Promise<{ id: string; remaining: number; status: string }> {
  const enrollment = await getEnrollment(enrollmentId)
  if (!enrollment) throw new Error('Enrollment not found')

  const billingPeriod = formatDateOnly(startOfCurrentMonth())
  const sessionsTotal = toNumber(enrollment.sessions_total)
  const bank = await db.queryOne<{ id: string; sessions_remaining: number | string | null; status: string }>(
    `INSERT INTO session_bank
      (enrollment_id, client_id, billing_period,
       sessions_allotted, sessions_remaining,
       grace_period_expires, status)
     VALUES ($1, $2, $3, $4, $4,
       ($3::date + INTERVAL '1 month' + INTERVAL '7 days'),
       'active')
     ON CONFLICT (enrollment_id, billing_period)
     DO UPDATE SET updated_at = NOW()
     RETURNING id, sessions_remaining, status`,
    [enrollmentId, clientId, billingPeriod, sessionsTotal]
  )

  if (!bank) throw new Error('Failed to create session bank')

  return {
    id: bank.id,
    remaining: toNumber(bank.sessions_remaining),
    status: bank.status,
  }
}

export async function checkBookingEligibility(
  enrollmentId: string,
  clientId: string,
  proposedDate: Date
): Promise<{ eligible: boolean; reason: string | null }> {
  const activeHold = await getActiveHold(enrollmentId)
  if (activeHold) {
    return {
      eligible: false,
      reason: `Enrollment on hold until ${new Date(`${activeHold.end_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}. Contact your coach.`,
    }
  }

  const currentBank = await getOrCreateSessionBank(enrollmentId, clientId)
  const graceBank = await getPreviousGraceBank(enrollmentId, proposedDate)
  const totalRemaining = currentBank.remaining + toNumber(graceBank?.sessions_remaining)
  if (totalRemaining <= 0) {
    return { eligible: false, reason: 'No sessions remaining this period' }
  }

  const enrollment = await getEnrollment(enrollmentId)
  if (!enrollment) {
    return { eligible: false, reason: 'Enrollment not found' }
  }

  const weeklyLimit = Math.max(toNumber(enrollment.sessions_per_week), 0)
  if (weeklyLimit > 0) {
    const weeklyUsed = await countWeeklyUsage(enrollmentId, proposedDate)
    if (weeklyUsed >= weeklyLimit) {
      return {
        eligible: false,
        reason: `Weekly limit reached (${weeklyLimit}x/week). Next available: ${new Date(`${nextWeekStart(proposedDate)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
      }
    }
  }

  return { eligible: true, reason: null }
}

export async function consumeSession(
  enrollmentId: string,
  clientId: string,
  bookingId: string,
  entitlementType: 'standard' | 'makeup' | 'grace' | 'override'
): Promise<string> {
  const bookableBank = await getBookableBank(enrollmentId, clientId)
  if (!bookableBank) throw new Error('No available session bank')

  return db.transaction(async (client) => {
    const bankUpdate = await client.query(
      `UPDATE session_bank
       SET sessions_used = COALESCE(sessions_used, 0) + 1,
           sessions_remaining = GREATEST(COALESCE(sessions_remaining, 0) - 1, 0),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [bookableBank.bankId]
    )

    if (!bankUpdate.rows[0]?.id) throw new Error('Session bank not found')

    await client.query(
      `UPDATE package_enrollments
       SET sessions_used = COALESCE(sessions_used, 0) + 1,
           sessions_remaining = GREATEST(COALESCE(sessions_remaining, COALESCE(sessions_total, 0)) - 1, 0),
           updated_at = NOW()
       WHERE id = $1`,
      [enrollmentId]
    )

    const entitlement = await client.query<{ id: string }>(
      `INSERT INTO session_entitlements (
         enrollment_id,
         client_id,
         booking_id,
         session_bank_id,
         entitlement_type,
         status,
         consumed_at
       ) VALUES ($1, $2, $3, $4, $5, 'consumed', NOW())
       RETURNING id`,
      [
        enrollmentId,
        clientId,
        bookingId,
        bookableBank.bankId,
        entitlementType === 'override' ? entitlementType : bookableBank.entitlementType === 'grace' ? 'grace' : entitlementType,
      ]
    )

    const entitlementId = entitlement.rows[0]?.id
    if (!entitlementId) throw new Error('Failed to create session entitlement')
    return entitlementId
  })
}

export async function handleCancellation(
  bookingId: string,
  sessionDateTime: Date,
  cancelledAt: Date
): Promise<{ action: 'returned' | 'forfeited'; hoursBeforeSession: number }> {
  const hoursBeforeSession = (sessionDateTime.getTime() - cancelledAt.getTime()) / (1000 * 60 * 60)
  const isLateCancel = hoursBeforeSession < 24

  await db.transaction(async (client) => {
    const entitlement = await client.query<EntitlementRow>(
      `SELECT id, booking_id, enrollment_id, session_bank_id, status, entitlement_type
       FROM session_entitlements
       WHERE booking_id = $1
       LIMIT 1`,
      [bookingId]
    )

    const record = entitlement.rows[0]
    if (!record) {
      await client.query(
        `UPDATE bookings
         SET status = 'cancelled', cancelled_at = NOW(),
             forfeited = $2,
             forfeiture_reason = $3
         WHERE id = $1`,
        [bookingId, isLateCancel, isLateCancel ? 'late_cancel' : null]
      )
      return
    }

    if (isLateCancel) {
      await client.query(
        `UPDATE session_entitlements
         SET status = 'forfeited',
             forfeiture_reason = 'late_cancel',
             cancellation_hours_before = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [record.id, hoursBeforeSession]
      )
      await client.query(
        `UPDATE session_bank
         SET sessions_forfeited = COALESCE(sessions_forfeited, 0) + 1,
             updated_at = NOW()
         WHERE id = $1`,
        [record.session_bank_id]
      )
      await client.query(
        `UPDATE package_enrollments
         SET sessions_forfeited = COALESCE(sessions_forfeited, 0) + 1,
             updated_at = NOW()
         WHERE id = $1`,
        [record.enrollment_id]
      )
      await client.query(
        `UPDATE bookings
         SET status = 'cancelled',
             forfeited = true,
             forfeiture_reason = 'late_cancel',
             cancelled_at = NOW()
         WHERE id = $1`,
        [bookingId]
      )
    } else {
      await client.query(
        `UPDATE session_entitlements
         SET status = 'returned',
             cancellation_hours_before = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [record.id, hoursBeforeSession]
      )
      await client.query(
        `UPDATE session_bank
         SET sessions_returned = COALESCE(sessions_returned, 0) + 1,
             sessions_remaining = COALESCE(sessions_remaining, 0) + 1,
             sessions_used = GREATEST(COALESCE(sessions_used, 0) - 1, 0),
             updated_at = NOW()
         WHERE id = $1`,
        [record.session_bank_id]
      )
      await client.query(
        `UPDATE package_enrollments
         SET sessions_used = GREATEST(COALESCE(sessions_used, 0) - 1, 0),
             sessions_remaining = COALESCE(sessions_remaining, 0) + 1,
             updated_at = NOW()
         WHERE id = $1`,
        [record.enrollment_id]
      )
      await client.query(
        `UPDATE bookings
         SET status = 'cancelled',
             cancelled_at = NOW()
         WHERE id = $1`,
        [bookingId]
      )
    }
  })

  return { action: isLateCancel ? 'forfeited' : 'returned', hoursBeforeSession }
}

export async function handleNoShow(bookingId: string): Promise<void> {
  await db.transaction(async (client) => {
    const entitlement = await client.query<EntitlementRow>(
      `SELECT id, enrollment_id, session_bank_id
       FROM session_entitlements
       WHERE booking_id = $1
       LIMIT 1`,
      [bookingId]
    )

    const record = entitlement.rows[0]
    if (!record) {
      await client.query(
        `UPDATE bookings
         SET status = 'no_show', forfeited = true, forfeiture_reason = 'no_show'
         WHERE id = $1`,
        [bookingId]
      )
      return
    }

    await client.query(
      `UPDATE session_entitlements
       SET status = 'forfeited',
           forfeiture_reason = 'no_show',
           updated_at = NOW()
       WHERE id = $1`,
      [record.id]
    )
    await client.query(
      `UPDATE session_bank
       SET sessions_forfeited = COALESCE(sessions_forfeited, 0) + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [record.session_bank_id]
    )
    await client.query(
      `UPDATE package_enrollments
       SET sessions_forfeited = COALESCE(sessions_forfeited, 0) + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [record.enrollment_id]
    )
    await client.query(
      `UPDATE bookings
       SET status = 'no_show', forfeited = true, forfeiture_reason = 'no_show'
       WHERE id = $1`,
      [bookingId]
    )
  })
}

export async function overrideForfeiture(
  entitlementId: string,
  overrideByUserId: string,
  overrideReason: string
): Promise<void> {
  const isAdmin = await isAdminUser(overrideByUserId)
  if (!isAdmin) throw new Error('Unauthorized')

  await db.transaction(async (client) => {
    const entitlement = await client.query<EntitlementRow>(
      `SELECT id, enrollment_id, session_bank_id, status
       FROM session_entitlements
       WHERE id = $1
       LIMIT 1`,
      [entitlementId]
    )

    const record = entitlement.rows[0]
    if (!record) throw new Error('Entitlement not found')
    if (record.status !== 'forfeited') throw new Error('Entitlement is not forfeited')

    await client.query(
      `UPDATE session_entitlements
       SET status = 'active',
           override_by = $2,
           override_reason = $3,
           override_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [entitlementId, overrideByUserId, overrideReason]
    )
    await client.query(
      `UPDATE session_bank
       SET sessions_forfeited = GREATEST(COALESCE(sessions_forfeited, 0) - 1, 0),
           sessions_remaining = COALESCE(sessions_remaining, 0) + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [record.session_bank_id]
    )
    await client.query(
      `UPDATE package_enrollments
       SET sessions_forfeited = GREATEST(COALESCE(sessions_forfeited, 0) - 1, 0),
           sessions_remaining = COALESCE(sessions_remaining, 0) + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [record.enrollment_id]
    )
  })
}

export async function placeOnHold({
  clientId,
  enrollmentId,
  holdType,
  reason,
  startDate,
  endDate,
  requestedBy,
}: {
  clientId: string
  enrollmentId: string
  holdType: 'vacation' | 'illness' | 'medical' | 'administrative'
  reason: string
  startDate: Date
  endDate: Date
  requestedBy: string
}): Promise<{ holdId: string; status: string }> {
  const overlap = await db.queryOne<{ id: string }>(
    `SELECT id
     FROM membership_holds
     WHERE enrollment_id = $1
       AND status IN ('pending', 'approved', 'active')
       AND start_date <= $2::date
       AND end_date >= $3::date
     LIMIT 1`,
    [enrollmentId, formatDateOnly(endDate), formatDateOnly(startDate)]
  )
  if (overlap) throw new Error('Overlapping hold exists')

  const admin = await isAdminUser(requestedBy)
  const autoApprove = admin || holdType === 'administrative'
  const today = formatDateOnly(new Date())

  return db.transaction(async (client) => {
    const inserted = await client.query<{ id: string; status: string }>(
      `INSERT INTO membership_holds (
         client_id,
         enrollment_id,
         hold_type,
         reason,
         start_date,
         end_date,
         status,
         requested_by,
         approved_by,
         approved_at,
         created_at,
         updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10,
         NOW(), NOW()
       )
       RETURNING id, status`,
      [
        clientId,
        enrollmentId,
        holdType,
        reason,
        formatDateOnly(startDate),
        formatDateOnly(endDate),
        autoApprove ? 'approved' : 'pending',
        requestedBy,
        autoApprove ? requestedBy : null,
        autoApprove ? new Date().toISOString() : null,
      ]
    )

    const hold = inserted.rows[0]
    if (!hold) throw new Error('Failed to create hold')

    if (autoApprove && formatDateOnly(startDate) <= today) {
      await freezeSessionBank(enrollmentId, hold.id, reason, client)
      await client.query(
        `UPDATE package_enrollments
         SET is_on_hold = true,
             hold_start = $2,
             hold_end = $3,
             updated_at = NOW()
         WHERE id = $1`,
        [enrollmentId, formatDateOnly(startDate), formatDateOnly(endDate)]
      )
      await client.query(
        `UPDATE membership_holds
         SET status = 'active',
             updated_at = NOW()
         WHERE id = $1`,
        [hold.id]
      )
      return { holdId: hold.id, status: 'active' }
    }

    return { holdId: hold.id, status: hold.status }
  })
}

export async function liftHold(
  holdId: string,
  liftedBy: string
): Promise<void> {
  void liftedBy
  await db.transaction(async (client) => {
    const hold = await client.query<HoldRow & { enrollment_id: string }>(
      `SELECT id, enrollment_id, start_date::text, end_date::text, hold_type, status
       FROM membership_holds
       WHERE id = $1
       LIMIT 1`,
      [holdId]
    )

    const record = hold.rows[0]
    if (!record) throw new Error('Hold not found')

    await client.query(
      `UPDATE membership_holds
       SET status = 'completed',
           updated_at = NOW()
       WHERE id = $1`,
      [holdId]
    )
    await client.query(
      `UPDATE session_bank
       SET is_frozen = false,
           frozen_at = NULL,
           freeze_reason = NULL,
           hold_id = NULL,
           updated_at = NOW()
       WHERE enrollment_id = $1
         AND hold_id = $2`,
      [record.enrollment_id, holdId]
    )
    await client.query(
      `UPDATE package_enrollments
       SET is_on_hold = false,
           hold_start = NULL,
           hold_end = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [record.enrollment_id]
    )
  })
}

export async function getClientBankStatus(
  enrollmentId: string
): Promise<SessionBankStatus | null> {
  const enrollment = await getEnrollment(enrollmentId)
  if (!enrollment) return null

  const billingPeriod = formatDateOnly(startOfCurrentMonth())
  await getOrCreateSessionBank(enrollmentId, enrollment.client_id)

  const [currentBank, graceBank, activeHold] = await Promise.all([
    db.queryOne<SessionBankRow>(
      `SELECT *
       FROM session_bank
       WHERE enrollment_id = $1 AND billing_period = $2
       LIMIT 1`,
      [enrollmentId, billingPeriod]
    ),
    getPreviousGraceBank(enrollmentId),
    getActiveHold(enrollmentId),
  ])

  if (!currentBank) return null

  const weeklyLimit = Math.max(toNumber(enrollment.sessions_per_week), 0)
  const weeklyUsed = await countWeeklyUsage(enrollmentId, new Date())
  const remaining = toNumber(currentBank.sessions_remaining) + toNumber(graceBank?.sessions_remaining)
  const eligibility = await checkBookingEligibility(enrollmentId, enrollment.client_id, new Date())

  return {
    enrollmentId,
    billingPeriod,
    allotted: toNumber(currentBank.sessions_allotted),
    used: toNumber(currentBank.sessions_used),
    forfeited: toNumber(currentBank.sessions_forfeited),
    returned: toNumber(currentBank.sessions_returned),
    remaining,
    graceExpires: graceBank?.grace_period_expires ?? currentBank.grace_period_expires,
    isOnHold: Boolean(activeHold),
    holdUntil: activeHold?.end_date ?? null,
    weeklyUsed,
    weeklyLimit,
    canBook: eligibility.eligible,
    cannotBookReason: eligibility.reason,
  }
}

export async function processGracePeriodExpiry(): Promise<void> {
  const banks = await db.query<SessionBankRow>(
    `SELECT *
     FROM session_bank
     WHERE status = 'active'
       AND grace_period_expires < NOW()
       AND sessions_remaining > 0
       AND COALESCE(is_frozen, false) = false`
  )

  for (const bank of banks) {
    const remaining = toNumber(bank.sessions_remaining)
    await db.query(
      `UPDATE session_bank
       SET sessions_forfeited = COALESCE(sessions_forfeited, 0) + $2,
           sessions_remaining = 0,
           status = 'expired',
           updated_at = NOW()
       WHERE id = $1`,
      [bank.id, remaining]
    )
  }
}
