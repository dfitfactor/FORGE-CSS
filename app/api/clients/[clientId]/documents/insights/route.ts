import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { buildClientAiContext, getFocusedInsightInputs } from '@/lib/client-ai-context'
import { generateCoachQueryInsight } from '@/services/ai-service'

export async function POST(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  const session = await getSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'Anthropic API key is not configured.' }, { status: 503 })
    }

    const client = await db.queryOne<{ coach_id: string | null }>(
      `SELECT coach_id FROM clients WHERE id = $1`,
      [params.clientId]
    )

    if (!client || (client.coach_id !== session.id && session.role !== 'admin')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const aiDocCount = await db.queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM client_documents
       WHERE client_id = $1
         AND include_in_ai = true`,
      [params.clientId]
    )

    if (Number(aiDocCount?.count ?? '0') === 0) {
      return NextResponse.json({ error: 'No AI-enabled documents found for this client.' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const query = typeof body.query === 'string' ? body.query.trim() : ''

    if (!query) {
      return NextResponse.json({ error: 'Question is required.' }, { status: 400 })
    }

    const context = await buildClientAiContext(params.clientId)
    if (!context) {
      return NextResponse.json({ error: 'Unable to build client context.' }, { status: 500 })
    }

    const focusedInputs = await getFocusedInsightInputs(params.clientId)
    const insight = await generateCoachQueryInsight(context.client, {
      query: `Focus this answer on this client's uploaded documents first. Only use other client data as supporting context. Coach question: ${query}`,
      ...focusedInputs,
    })

    return NextResponse.json({
      success: true,
      insight: {
        title: insight.title,
        confidence: insight.confidence,
        metrics: insight.metrics,
        decision: insight.decision,
        constraint: insight.constraint,
        actions: insight.actions,
        context: insight.context,
        tags: insight.tags ?? [],
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Insight generation failed'
    console.error('[clients/[clientId]/documents/insights] POST error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
