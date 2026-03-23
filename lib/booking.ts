import { z } from 'zod'

export const SERVICE_CATEGORIES = ['assessment', 'training', 'coaching', 'nutrition', 'wellness'] as const
export const SERVICE_SECTION_OPTIONS = ['assessments', 'training', 'progress', 'nutrition', 'wellness'] as const
export const SERVICE_TYPES = ['single', 'included', 'addon', 'makeup', 'waitlist'] as const
export const BOOKING_TYPES = ['scheduled', 'async', 'package_only'] as const
export const REQUIRED_FORM_TYPES = ['intake', 'parq', 'health-questionnaire', 'waiver'] as const
export const FORGE_STAGE_OPTIONS = [
  'youth',
  'foundations',
  'optimization',
  'resilience',
  'growth',
  'empowerment',
  'flex',
  'nutrition',
] as const
export const BILLING_TYPES = ['monthly', 'pif', 'total'] as const
export const BOOKING_STATUS_OPTIONS = ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'] as const
export const PAYMENT_STATUS_OPTIONS = ['unpaid', 'paid', 'waived'] as const
export const AVAILABILITY_RULE_TYPES = ['weekly', 'settings', 'blackout', 'blocked'] as const

export const serviceSchema = z.object({
  name: z.string().trim().min(1).max(255),
  slug: z.string().trim().min(1).max(255),
  description: z.string().trim().optional().nullable(),
  duration_minutes: z.number().int().min(1).max(1440),
  price_cents: z.number().int().min(0),
  category: z.enum(SERVICE_CATEGORIES),
  section: z.enum(SERVICE_SECTION_OPTIONS).optional().nullable(),
  service_type: z.enum(SERVICE_TYPES),
  booking_type: z.enum(BOOKING_TYPES),
  required_forms: z.array(z.enum(REQUIRED_FORM_TYPES)).default([]),
  forge_stage: z.enum(FORGE_STAGE_OPTIONS).optional().nullable(),
  is_public: z.boolean().default(false),
  sort_order: z.number().int().min(0).default(0),
})

export const packageSchema = z.object({
  name: z.string().trim().min(1).max(255),
  slug: z.string().trim().min(1).max(255),
  description: z.string().trim().optional().nullable(),
  session_count: z.number().int().min(1).max(999),
  duration_minutes: z.number().int().min(1).max(1440),
  price_cents: z.number().int().min(0),
  billing_type: z.enum(BILLING_TYPES),
  billing_period_months: z.number().int().min(1).max(36).optional().nullable(),
  forge_stage: z.enum(FORGE_STAGE_OPTIONS),
  is_public: z.boolean().default(false),
  sort_order: z.number().int().min(0).default(0),
})

export const bookingPatchSchema = z.object({
  status: z.enum(BOOKING_STATUS_OPTIONS).optional(),
  attended: z.boolean().optional(),
  payment_status: z.enum(PAYMENT_STATUS_OPTIONS).optional(),
  booking_date: z.string().trim().min(1).optional(),
  booking_time: z.string().trim().min(1).optional(),
  notes: z.string().trim().max(5000).optional().nullable(),
})

export const formTemplatePatchSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().optional().nullable(),
  fields: z.unknown().optional(),
  is_active: z.boolean().optional(),
  requires_signature: z.boolean().optional(),
  validity_days: z.number().int().min(1).max(3650).optional().nullable(),
})

export const availabilityRuleSchema = z.object({
  rule_type: z.enum(AVAILABILITY_RULE_TYPES).default('weekly'),
  day_of_week: z.number().int().min(0).max(6).optional().nullable(),
  start_time: z.string().trim().optional().nullable(),
  end_time: z.string().trim().optional().nullable(),
  slot_duration_minutes: z.number().int().min(15).max(240).optional().nullable(),
  buffer_minutes: z.number().int().min(0).max(120).optional().nullable(),
  minimum_notice_hours: z.number().int().min(0).max(24 * 30).optional().nullable(),
  blackout_date: z.string().trim().optional().nullable(),
  settings_key: z.string().trim().optional().nullable(),
  settings_value: z.unknown().optional().nullable(),
  is_active: z.boolean().default(true),
})

export const publicBookingSchema = z.object({
  service_id: z.string().uuid().optional(),
  package_id: z.string().uuid().optional(),
  client_name: z.string().trim().min(1).max(255),
  client_email: z.string().trim().email().max(255),
  client_phone: z.string().trim().min(7).max(50),
  booking_date: z.string().trim().min(1),
  booking_time: z.string().trim().min(1),
  notes: z.string().trim().max(5000).optional().nullable(),
})
  .refine((value) => Boolean(value.service_id || value.package_id), {
    message: 'service_id or package_id is required',
    path: ['service_id'],
  })
  .refine((value) => !(value.service_id && value.package_id), {
    message: 'Provide only one of service_id or package_id',
    path: ['package_id'],
  })

export function formatPriceFromCents(priceCents: number | null | undefined) {
  if (!priceCents || priceCents <= 0) return 'Free'
  return `$${(priceCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatDurationLabel(minutes: number | null | undefined) {
  if (!minutes) return '—'
  if (minutes < 60) return `${minutes} min`
  if (minutes % 60 === 0) return `${minutes / 60} hr`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return `${hours} hr ${remainder} min`
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function stageLabel(stage: string | null | undefined) {
  if (!stage) return 'Unassigned'
  return stage
    .split(/[-_]/g)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
