import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(
  request: NextRequest,
  { params }: { params: { clientId: string; protocolId: string } }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const client = await db.queryOne<{ coach_id: string; full_name: string; email: string }>(
      `SELECT coach_id, full_name, email FROM clients WHERE id = $1`,
      [params.clientId]
    )
    if (!client || (client.coach_id !== session.id && session.role !== 'admin')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    if (!client.email) {
      return NextResponse.json({ error: 'Client has no email address' }, { status: 400 })
    }

    const protocol = await db.queryOne<{
      name: string; protocol_type: string; stage: string
      effective_date: string; notes: string | null
      protocol_payload: Record<string, unknown>
    }>(
      `SELECT name, protocol_type, stage, effective_date::text, notes, protocol_payload
       FROM protocols WHERE id = $1 AND client_id = $2`,
      [params.protocolId, params.clientId]
    )
    if (!protocol) return NextResponse.json({ error: 'Protocol not found' }, { status: 404 })

    const payload = protocol.protocol_payload as Record<string, unknown>
    const ns = payload?.nutritionStructure as Record<string, unknown> | undefined
    const ss = payload?.sessionStructure as Record<string, unknown> | undefined
    const rs = payload?.recoveryStructure as Record<string, unknown> | undefined
    const firstName = client.full_name.split(' ')[0]

    const emailBody = [
      `Hi ${firstName},`,
      '',
      `Your new protocol is ready: ${protocol.name}`,
      '',
      ss ? [
        'MOVEMENT',
        `• Sessions per week: ${ss.sessionsPerWeek}`,
        `• Session type: ${ss.sessionType}`,
        `• Complexity tier: ${ss.complexityCeiling}`,
        `• Volume: ${ss.volumeLevel}`,
        '',
      ].join('\n') : '',
      ns ? [
        'NUTRITION TARGETS',
        `• Calories: ${ns.dailyCalories} kcal/day`,
        `• Protein: ${ns.proteinG}g | Carbs: ${ns.carbG}g | Fats: ${ns.fatG}g`,
        `• Meals per day: ${ns.mealFrequency}`,
        `• Hydration: ≥ ${ns.hydrationTargetOz ?? 90} oz/day`,
        ns.mealTiming ? `• Timing: ${ns.mealTiming}` : '',
        '',
      ].filter(Boolean).join('\n') : '',
      rs ? [
        'RECOVERY',
        `• Sleep target: ${rs.sleepTarget}`,
        `• Active recovery: ${rs.activeRecoveryDays} days/week`,
        `• Daily mobility: ${rs.mobilityMinutes} minutes`,
        '',
      ].join('\n') : '',
      payload?.rationale ? `PROTOCOL RATIONALE\n${payload.rationale}\n` : '',
      protocol.notes ? `A NOTE FROM YOUR COACH\n${protocol.notes}\n` : '',
      payload?.clientFacingMessage ? `${payload.clientFacingMessage}\n` : '',
      `Effective date: ${protocol.effective_date}`,
      '',
      'If you have any questions, please reach out anytime.',
      '',
      'Strength Forged In Training,',
      'Coach Dee Byfield, MBA, CHC, CSNC, CPT',
      'DFitFactor',
    ].filter(s => s !== undefined).join('\n').trim()

    const subject = `Your FORGË Protocol: ${protocol.name}`

    // Use fetch directly to call Gmail MCP
    const mcpResponse = await fetch('https://gmail.mcp.claude.com/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ANTHROPIC_API_KEY}`,
      },
      body: JSON.stringify({
        method: 'tools/call',
        params: {
          name: 'send_email',
          arguments: {
            to: client.email,
            subject,
            body: emailBody,
          }
        }
      })
    })

    if (!mcpResponse.ok) {
      const errText = await mcpResponse.text()
      console.error('Gmail MCP error:', errText)
      // Fall back to returning draft content for manual sending
      return NextResponse.json({
        success: false,
        draft: true,
        to: client.email,
        subject,
        body: emailBody,
        error: 'Gmail MCP unavailable — draft returned for manual sending',
      })
    }

    return NextResponse.json({
      success: true,
      sentTo: client.email,
      subject,
    })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('Email error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
