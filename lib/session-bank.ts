import { PoolClient } from 'pg'
import { db } from '@/lib/db'

export interface SessionBankStatus {
  enrollmentId: string
  billingCycleStart: string | null
  billingCycleEnd: string | null
  subscriptionStatus: string | null
  gracePeriodEndsAt: string | null
  lastRenewedAt: string | null
  nextRenewalAt: string | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
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
  monthlyUsed: number
  monthlyLimit: number
  canBook: boolean
  cannotBookReason: string | null
  expired: boolean
  overrideLimits: boolean
  overrideExpiration: boolean
  overrideSetAt: string | null
}

type EnrollmentRow = {
  id: string
  client_id: string
  package_id: string | null
  sessions_total: number | string | null
  sessions_remaining: number | string | null
  sessions_used: number | string | null
  sessions_forfeited: number | string | null
  sessions_returned: number | string | null
  weekly_limit: number | string | null
  monthly_limit: number | string | null
  sessions_per_week: number | string | null
  billing_cycle_start: string | null
  billing_cycle_end: string | null
  sessions_expire_at: string | null
  override_limits: boolean | null
  override_expiration: boolean | null
  override_set_at: string | null
  subscription_status: string | null
  grace_period_ends_at: string | null
  last_renewed_at: string | null
  next_renewal_at: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  is_on_hold: boolean | null
  hold_end: string | null
  start_date: string | null
  created_at: string | null
  status: string
}

type BookingCountRow = {
  count: number | string
}

type HoldRow = {
  id: string
  enrollment_id: string
  end_date: string
  status: string
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function formatDateOnly(value: Date) {
  const year = value.getUTCFullYear()
  const month = `${value.getUTCMonth() + 1}`.padStart(2, '0')
  const day = `${value.getUTCDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function addMonthsPreservingDay(anchor: Date, months: number) {
  const year = anchor.getUTCFullYear()
  const monthIndex = anchor.getUTCMonth() + months
  const targetYear = year + Math.floor(monthIndex / 12)
  const normalizedMonth = ((monthIndex % 12) + 12) % 12
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate()
  const day = Math.min(anchor.getUTCDate(), lastDay)
  return new Date(Date.UTC(targetYear, normalizedMonth, day))
}

function startOfWeek(date: Date) {
  const next = new Date(date)
  const day = next.getUTCDay()
  next.setUTCDate(next.getUTCDate() - day)
  next.setUTCHours(0, 0, 0, 0)
  return next
}

function endOfWeek(date: Date) {
  return addDays(startOfWeek(date), 7)
}

function toTimestamp(date: string, time: string) {
  return new Date(`${date}T${time.length === 5 ? `${time}:00` : time}`)
}

function computeCycleWindow(anchorDate: string, reference = new Date()) {
  const anchor = parseDateOnly(anchorDate)
  const referenceDate = parseDateOnly(formatDateOnly(reference))
  let monthOffset =
    (referenceDate.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    (referenceDate.getUTCMonth() - anchor.getUTCMonth())

  let cycleStart = addMonthsPreservingDay(anchor, monthOffset)
  if (cycleStart.getTime() > referenceDate.getTime()) {
    monthOffset -= 1
    cycleStart = addMonthsPreservingDay(anchor, monthOffset)
  }

  const nextCycleStart = addMonthsPreservingDay(anchor, monthOffset + 1)
  const cycleEnd = addDays(nextCycleStart, -1)
  const expiration = addDays(nextCycleStart, 7)

  return {
    cycleStart: formatDateOnly(cycleStart),
    cycleEnd: formatDateOnly(cycleEnd),
    sessionsExpireAt: expiration.toISOString(),
  }
}

async function getActiveEnrollmentByClientId(clientId: string, client?: PoolClient) {
  const executor = client ?? db
  const queryOne =
    'queryOne' in executor
      ? executor.queryOne.bind(executor)
      : async <T>(sql: string, params?: unknown[]) => {
          const result = await executor.query(sql, params)
          return (result.rows[0] ?? null) as T | null
        }

  return queryOne<EnrollmentRow>(
    `SELECT *
     FROM package_enrollments
     WHERE client_id = $1
       AND status = 'active'
     ORDER BY created_at DESC
     LIMIT 1`,
    [clientId]
  )
}

async function updateEnrollmentCycleFields(enrollment: EnrollmentRow, client?: PoolClient) {
  const executor = client ?? db
  const queryOne =
    'queryOne' in executor
      ? executor.queryOne.bind(executor)
      : async <T>(sql: string, params?: unknown[]) => {
          const result = await executor.query(sql, params)
          return (result.rows[0] ?? null) as T | null
        }

  const anchorDate = enrollment.billing_cycle_start ?? enrollment.start_date ?? enrollment.created_at?.slice(0, 10)
  if (!anchorDate) return enrollment

  const cycle = computeCycleWindow(anchorDate)
  const needsUpdate =
    enrollment.billing_cycle_start !== cycle.cycleStart ||
    enrollment.billing_cycle_end !== cycle.cycleEnd ||
    !enrollment.sessions_expire_at

  if (!needsUpdate) return enrollment

  return (
    await queryOne<EnrollmentRow>(
      `UPDATE package_enrollments
       SET billing_cycle_start = $2::date,
           billing_cycle_end = $3::date,
           sessions_expire_at = $4::timestamptz,
           weekly_limit = COALESCE(weekly_limit, sessions_per_week, 1),
           monthly_limit = COALESCE(monthly_limit, sessions_total, 4),
           sessions_total = COALESCE(sessions_total, 0),
           sessions_remaining = COALESCE(sessions_remaining, sessions_total, 0),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [enrollment.id, cycle.cycleStart, cycle.cycleEnd, cycle.sessionsExpireAt]
    )
  ) ?? enrollment
}

async function countBookingsForRange(clientId: string, start: string, endExclusive: string) {
  const result = await db.queryOne<BookingCountRow>(
    `SELECT COUNT(*) AS count
     FROM bookings
     WHERE client_id = $1
       AND status NOT IN ('cancelled', 'declined')
       AND scheduled_at >= $2::timestamptz
       AND scheduled_at < $3::timestamptz`,
    [clientId, `${start}T00:00:00.000Z`, `${endExclusive}T00:00:00.000Z`]
  )

  return toNumber(result?.count)
}

export async function getSessionsRemaining(clientId: string) {
  const activeEnrollment = await getActiveEnrollmentByClientId(clientId)
  if (!activeEnrollment) {
    return { success: false as const, remaining: 0, expired: false, enrollment: null }
  }

  const enrollment = await updateEnrollmentCycleFields(activeEnrollment)
  const remaining = toNumber(enrollment.sessions_remaining)
  const isExpired =
    !enrollment.override_expiration &&
    Boolean(enrollment.sessions_expire_at) &&
    new Date(enrollment.sessions_expire_at as string).getTime() < Date.now()

  if (isExpired) {
    return { success: true as const, remaining: 0, expired: true, enrollment }
  }

  return { success: true as const, remaining, expired: false, enrollment }
}

export async function deductSession(clientId: string, client?: PoolClient) {
  const enrollment = await getActiveEnrollmentByClientId(clientId, client)
  if (!enrollment) throw new Error('Active enrollment not found')

  const hydrated = await updateEnrollmentCycleFields(enrollment, client)
  const expired =
    !hydrated.override_expiration &&
    Boolean(hydrated.sessions_expire_at) &&
    new Date(hydrated.sessions_expire_at as string).getTime() < Date.now()

  if (expired) throw new Error('Sessions have expired')
  if (toNumber(hydrated.sessions_remaining) <= 0) throw new Error('No sessions remaining')

  const row = client
    ? ((await client.query(
        `UPDATE package_enrollments
         SET sessions_remaining = sessions_remaining - 1,
             sessions_used = COALESCE(sessions_used, 0) + 1,
             updated_at = NOW()
         WHERE id = $1
           AND sessions_remaining > 0
         RETURNING sessions_remaining`,
        [hydrated.id]
      )).rows[0] as { sessions_remaining: number | string } | undefined)
    : await db.queryOne<{ sessions_remaining: number | string }>(
        `UPDATE package_enrollments
         SET sessions_remaining = sessions_remaining - 1,
             sessions_used = COALESCE(sessions_used, 0) + 1,
             updated_at = NOW()
         WHERE id = $1
           AND sessions_remaining > 0
         RETURNING sessions_remaining`,
        [hydrated.id]
      )

  if (!row) throw new Error('Failed to deduct session')

  return { success: true as const, remaining: toNumber(row.sessions_remaining), enrollmentId: hydrated.id }
}

export async function restoreSession(clientId: string, client?: PoolClient) {
  const enrollment = await getActiveEnrollmentByClientId(clientId, client)
  if (!enrollment) throw new Error('Active enrollment not found')

  const row = client
    ? ((await client.query(
        `UPDATE package_enrollments
         SET sessions_remaining = sessions_remaining + 1,
             sessions_used = GREATEST(COALESCE(sessions_used, 0) - 1, 0),
             sessions_returned = COALESCE(sessions_returned, 0) + 1,
             updated_at = NOW()
         WHERE id = $1
         RETURNING sessions_remaining`,
        [enrollment.id]
      )).rows[0] as { sessions_remaining: number | string } | undefined)
    : await db.queryOne<{ sessions_remaining: number | string }>(
        `UPDATE package_enrollments
         SET sessions_remaining = sessions_remaining + 1,
             sessions_used = GREATEST(COALESCE(sessions_used, 0) - 1, 0),
             sessions_returned = COALESCE(sessions_returned, 0) + 1,
             updated_at = NOW()
         WHERE id = $1
         RETURNING sessions_remaining`,
        [enrollment.id]
      )

  if (!row) throw new Error('Failed to restore session')

  return { success: true as const, remaining: toNumber(row.sessions_remaining), enrollmentId: enrollment.id }
}

export async function checkBookingLimits(clientId: string, date: Date) {
  const activeEnrollment = await getActiveEnrollmentByClientId(clientId)
  if (!activeEnrollment) {
    return { allowed: false as const, reason: 'no_active_package' as const, override: false }
  }

  const enrollment = await updateEnrollmentCycleFields(activeEnrollment)
  if (enrollment.override_limits) {
    return { allowed: true as const, override: true }
  }

  const weeklyLimit = Math.max(toNumber(enrollment.weekly_limit || enrollment.sessions_per_week), 0)
  const monthlyLimit = Math.max(toNumber(enrollment.monthly_limit || enrollment.sessions_total), 0)

  const weekStart = formatDateOnly(startOfWeek(date))
  const weekEnd = formatDateOnly(endOfWeek(date))
  const weeklyCount = await countBookingsForRange(clientId, weekStart, weekEnd)
  if (weeklyLimit > 0 && weeklyCount >= weeklyLimit) {
    return { allowed: false as const, reason: 'weekly_limit' as const, override: false }
  }

  const monthlyCount = enrollment.billing_cycle_start && enrollment.billing_cycle_end
    ? await countBookingsForRange(clientId, enrollment.billing_cycle_start, formatDateOnly(addDays(parseDateOnly(enrollment.billing_cycle_end), 1)))
    : 0

  if (monthlyLimit > 0 && monthlyCount >= monthlyLimit) {
    return { allowed: false as const, reason: 'monthly_limit' as const, override: false }
  }

  return { allowed: true as const, override: false }
}

export async function checkAndExpireSessions() {
  await db.query(
    `UPDATE package_enrollments
     SET sessions_remaining = 0,
         updated_at = NOW()
     WHERE status = 'active'
       AND COALESCE(override_expiration, false) = false
       AND sessions_expire_at IS NOT NULL
       AND sessions_expire_at < NOW()
       AND sessions_remaining > 0`
  )

  const enrollments = await db.query<EnrollmentRow>(
    `SELECT *
     FROM package_enrollments
     WHERE status = 'active'`
  )

  for (const enrollment of enrollments) {
    await updateEnrollmentCycleFields(enrollment)
  }
}

export async function getClientBankStatus(enrollmentId: string): Promise<SessionBankStatus | null> {
  const activeEnrollment = await db.queryOne<EnrollmentRow>(
    `SELECT *
     FROM package_enrollments
     WHERE id = $1
     LIMIT 1`,
    [enrollmentId]
  )

  if (!activeEnrollment) return null
  const enrollment = await updateEnrollmentCycleFields(activeEnrollment)

  const remainingResult = await getSessionsRemaining(enrollment.client_id)
  const now = new Date()
  const weekStart = formatDateOnly(startOfWeek(now))
  const weekEnd = formatDateOnly(endOfWeek(now))

  const [weeklyUsed, monthlyUsed] = await Promise.all([
    countBookingsForRange(enrollment.client_id, weekStart, weekEnd),
    enrollment.billing_cycle_start && enrollment.billing_cycle_end
      ? countBookingsForRange(
          enrollment.client_id,
          enrollment.billing_cycle_start,
          formatDateOnly(addDays(parseDateOnly(enrollment.billing_cycle_end), 1))
        )
      : Promise.resolve(0),
  ])

  const weeklyLimit = Math.max(toNumber(enrollment.weekly_limit || enrollment.sessions_per_week), 0)
  const monthlyLimit = Math.max(toNumber(enrollment.monthly_limit || enrollment.sessions_total), 0)
  const allotted = Math.max(toNumber(enrollment.sessions_total), 0)
  const remaining = remainingResult.remaining
  const used = Math.max(allotted - remaining, 0)
  const expired = remainingResult.expired
  const isPaused = enrollment.subscription_status === 'paused'
  const canBook = !expired && remaining > 0 && !enrollment.is_on_hold && !isPaused
  const cannotBookReason = enrollment.is_on_hold
    ? 'Booking is paused while this package is on hold.'
    : isPaused
      ? 'Booking is unavailable while the subscription is paused.'
    : expired
      ? 'Session balance has expired for this cycle.'
      : remaining <= 0
        ? 'No sessions remaining.'
        : null

  return {
    enrollmentId: enrollment.id,
    billingCycleStart: enrollment.billing_cycle_start,
    billingCycleEnd: enrollment.billing_cycle_end,
    subscriptionStatus: enrollment.subscription_status,
    gracePeriodEndsAt: enrollment.grace_period_ends_at,
    lastRenewedAt: enrollment.last_renewed_at,
    nextRenewalAt: enrollment.next_renewal_at,
    stripeCustomerId: enrollment.stripe_customer_id,
    stripeSubscriptionId: enrollment.stripe_subscription_id,
    allotted,
    used,
    forfeited: toNumber(enrollment.sessions_forfeited),
    returned: toNumber(enrollment.sessions_returned),
    remaining,
    graceExpires: enrollment.sessions_expire_at,
    isOnHold: Boolean(enrollment.is_on_hold),
    holdUntil: enrollment.hold_end,
    weeklyUsed,
    weeklyLimit,
    monthlyUsed,
    monthlyLimit,
    canBook,
    cannotBookReason,
    expired,
    overrideLimits: Boolean(enrollment.override_limits),
    overrideExpiration: Boolean(enrollment.override_expiration),
    overrideSetAt: enrollment.override_set_at,
  }
}

export async function checkBookingEligibility(
  enrollmentId: string,
  clientId: string,
  proposedDate: Date
): Promise<{ eligible: boolean; reason: string | null }> {
  const bank = await getClientBankStatus(enrollmentId)
  if (!bank) return { eligible: false, reason: 'Active enrollment not found' }
  if (bank.isOnHold) return { eligible: false, reason: bank.cannotBookReason }
  if (bank.expired || bank.remaining <= 0) return { eligible: false, reason: bank.cannotBookReason }

  const limitCheck = await checkBookingLimits(clientId, proposedDate)
  if (!limitCheck.allowed) {
    return {
      eligible: false,
      reason: limitCheck.reason === 'weekly_limit' ? 'Weekly booking limit reached' : 'Monthly booking limit reached',
    }
  }

  return { eligible: true, reason: null }
}

export async function consumeSession(
  enrollmentId: string,
  clientId: string,
  bookingId: string,
  entitlementType: 'standard' | 'makeup' | 'grace' | 'override'
) {
  void enrollmentId
  const result = await deductSession(clientId)
  await db.query(
    `UPDATE bookings
     SET session_deducted = true,
         is_makeup = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [bookingId, entitlementType === 'makeup' || entitlementType === 'override']
  )
  return `legacy-${result.enrollmentId}`
}

export async function handleCancellation(
  bookingId: string,
  sessionDateTime: Date,
  cancelledAt: Date
): Promise<{ action: 'returned' | 'forfeited'; hoursBeforeSession: number }> {
  const hoursBeforeSession = (sessionDateTime.getTime() - cancelledAt.getTime()) / (1000 * 60 * 60)
  await db.query(
    `UPDATE bookings
     SET status = 'cancelled',
         cancelled_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [bookingId]
  )
  return { action: 'forfeited', hoursBeforeSession }
}

export async function handleNoShow(bookingId: string): Promise<void> {
  await db.query(
    `UPDATE bookings
     SET status = 'no_show',
         updated_at = NOW()
     WHERE id = $1`,
    [bookingId]
  )
}

export async function overrideForfeiture(
  entitlementId: string,
  overrideByUserId: string,
  overrideReason: string
): Promise<void> {
  void entitlementId
  void overrideByUserId
  void overrideReason
  throw new Error('Legacy forfeiture override is no longer supported in the active booking flow')
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
         created_at,
         updated_at
       ) VALUES (
         $1, $2, $3, $4, $5::date, $6::date, 'approved', $7, NOW(), NOW()
       )
       RETURNING id, status`,
      [
        clientId,
        enrollmentId,
        holdType,
        reason,
        formatDateOnly(startDate),
        formatDateOnly(endDate),
        requestedBy,
      ]
    )

    const hold = inserted.rows[0]
    if (!hold) throw new Error('Failed to create hold')

    await client.query(
      `UPDATE package_enrollments
       SET is_on_hold = true,
           hold_start = $2::date,
           hold_end = $3::date,
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
  })
}

export async function liftHold(holdId: string, liftedBy: string): Promise<void> {
  void liftedBy
  const hold = await db.queryOne<HoldRow>(
    `SELECT id, enrollment_id, end_date::text AS end_date, status
     FROM membership_holds
     WHERE id = $1
     LIMIT 1`,
    [holdId]
  )

  if (!hold) throw new Error('Hold not found')

  await db.transaction(async (client) => {
    await client.query(
      `UPDATE membership_holds
       SET status = 'completed',
           updated_at = NOW()
       WHERE id = $1`,
      [holdId]
    )

    await client.query(
      `UPDATE package_enrollments
       SET is_on_hold = false,
           hold_start = NULL,
           hold_end = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [hold.enrollment_id]
    )
  })
}

export async function processGracePeriodExpiry(): Promise<void> {
  await checkAndExpireSessions()
}
