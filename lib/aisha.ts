import { getIntegrationSetting } from '@/lib/integration-settings'

export const AISHA_WEBHOOK_URL =
  'https://api.aishacrm.com/api/workflows/855b8e91-57dc-4084-a3ee-fde8cdb1aba6/webhook'

export type AishaLeadPayload = {
  email: string
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  company?: string | null
  source?: string | null
  notes?: string | null
  goal?: string | null
  next_action?: string | null
  status?: string | null
  score?: number | null
  css_client_id?: string | null
  converted_at?: string | null
  aisha_lead_id?: string | null
  source_system?: string
  event_type: 'lead.created' | 'lead.updated' | 'lead.won'
}

type SendResult = {
  success: boolean
  error: string | null
}

async function getAishaApiKey() {
  if (process.env.AISHA_API_KEY?.trim()) {
    return process.env.AISHA_API_KEY.trim()
  }

  try {
    const setting = await getIntegrationSetting('aisha_crm')
    return setting?.api_key?.trim() || null
  } catch (error) {
    console.error('[aisha] failed to read integration settings:', error)
    return null
  }
}

export async function sendToAisha(payload: Record<string, unknown>): Promise<SendResult> {
  try {
    const apiKey = await getAishaApiKey()

    if (!apiKey) {
      const message = 'AISHA_API_KEY is not configured'
      console.warn(`[aisha] ${message}`)
      return { success: false, error: message }
    }

    const response = await fetch(AISHA_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      const message = `Ai-SHA webhook returned ${response.status}${errorText ? `: ${errorText}` : ''}`
      console.error('[aisha] outbound sync failed:', message)
      return { success: false, error: message }
    }

    return { success: true, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Ai-SHA sync error'
    console.error('[aisha] outbound sync exception:', error)
    return { success: false, error: message }
  }
}

export async function createAishaLead(lead: {
  email: string
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  source?: string | null
  notes?: string | null
  goal?: string | null
}) {
  return sendToAisha({
    event_type: 'lead.created',
    email: lead.email,
    first_name: lead.first_name,
    last_name: lead.last_name,
    phone: lead.phone,
    source: lead.source,
    notes: lead.notes,
    goal: lead.goal,
    status: 'new',
    source_system: 'FORGE_CSS',
  })
}

export async function updateAishaLeadStage(
  lead: {
    email: string
    first_name?: string | null
    last_name?: string | null
  },
  newStatus: string
) {
  return sendToAisha({
    event_type: 'lead.updated',
    email: lead.email,
    first_name: lead.first_name,
    last_name: lead.last_name,
    status: newStatus,
    source_system: 'FORGE_CSS',
  })
}

export async function markAishaLeadWon(
  lead: {
    email: string
    first_name?: string | null
    last_name?: string | null
  },
  clientId: string
) {
  return sendToAisha({
    event_type: 'lead.won',
    email: lead.email,
    first_name: lead.first_name,
    last_name: lead.last_name,
    status: 'won',
    css_client_id: clientId,
    converted_at: new Date().toISOString(),
    source_system: 'FORGE_CSS',
  })
}
