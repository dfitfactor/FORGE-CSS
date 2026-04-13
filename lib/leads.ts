export const LEAD_STATUSES = [
  'new',
  'contacted',
  'discovery_booked',
  'discovery_complete',
  'proposal_sent',
  'won',
  'lost',
  'nurture',
] as const

export const LEAD_SOURCES = [
  'instagram',
  'youtube',
  'referral',
  'paid_ads',
  'website',
  'manual',
] as const

export type LeadStatus = (typeof LEAD_STATUSES)[number]
export type LeadSource = (typeof LEAD_SOURCES)[number]

export type LeadRecord = {
  id: string
  aisha_lead_id: string | null
  first_name: string | null
  last_name: string | null
  email: string
  phone: string | null
  company: string | null
  source: string | null
  status: string
  score: number | null
  notes: string | null
  next_action: string | null
  goal: string | null
  raw_payload: Record<string, unknown> | null
  aisha_synced: boolean
  aisha_synced_at: string | null
  converted_to_client: boolean
  client_id: string | null
  converted_at: string | null
  converted_by: string | null
  last_aisha_event: string | null
  last_aisha_event_at: string | null
  created_at: string
  updated_at: string
}

export function leadFullName(lead: Pick<LeadRecord, 'first_name' | 'last_name' | 'email'>) {
  const fullName = `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim()
  return fullName || lead.email
}

export function leadStatusLabel(status: string) {
  return status.replace(/_/g, ' ')
}
