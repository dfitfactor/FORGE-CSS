import { NextRequest, NextResponse } from 'next/server'
import { getClientSession } from '@/lib/client-auth'
import { db } from '@/lib/db'

export async function POST(request: NextRequest) {
  const session = await getClientSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { formSlug, responses, signatureName } = await request.json()

    if (!formSlug || !signatureName) {
      return NextResponse.json(
        { error: 'Form slug and signature required' },
        { status: 400 }
      )
    }

    const template = await db.queryOne<{
      id: string
      validity_days: number | null
    }>(
      `SELECT id, validity_days FROM form_templates WHERE slug = $1`,
      [formSlug]
    )

    if (!template) {
      return NextResponse.json(
        { error: 'Form template not found' },
        { status: 404 }
      )
    }

    const expiresAt = template.validity_days
      ? new Date(Date.now() + template.validity_days * 24 * 60 * 60 * 1000)
      : null

    const existing = await db.queryOne(
      `SELECT id FROM form_submissions
       WHERE client_id = $1
       AND form_template_id = $2
       AND status = 'submitted'
       AND (expires_at IS NULL OR expires_at > NOW())`,
      [session.clientId, template.id]
    )

    if (existing) {
      return NextResponse.json({ 
        success: true, 
        message: 'Form already submitted' 
      })
    }

    await db.query(
      `INSERT INTO form_submissions (
        client_id, form_template_id, responses,
        signature_data, status, submitted_at, expires_at
      ) VALUES ($1, $2, $3, $4, 'submitted', NOW(), $5)`,
      [
        session.clientId,
        template.id,
        JSON.stringify(responses),
        signatureName,
        expiresAt?.toISOString() || null,
      ]
    )

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[forms/submit]', err)
    return NextResponse.json(
      { error: err.message || 'Submission failed' },
      { status: 500 }
    )
  }
}
