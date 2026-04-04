import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/db'
import { getSession, requireRole } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const session = await getSession(request)

  try {
    requireRole(session, 'admin', 'coach')
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 })
    }

    const client = await db.queryOne<{ id: string; full_name: string; email: string }>(
      `SELECT id, full_name, email
       FROM clients
       WHERE LOWER(email) = LOWER($1) AND status != 'archived'`,
      [email]
    )

    if (!client) {
      return NextResponse.json(
        { success: false, error: 'No active client found for that email.' },
        { status: 404 }
      )
    }

    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000)

    await db.query(
      `INSERT INTO client_auth_tokens
         (client_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [client.id, token, expiresAt.toISOString()]
    )

    const baseUrl = process.env.NEXTAUTH_URL || 'https://forge-css.vercel.app'
    const magicLink = `${baseUrl}/api/portal/auth/verify?token=${token}`
    const fromAddress = process.env.RESEND_FROM_EMAIL || 'FORGË <onboarding@resend.dev>'

    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)

    await resend.emails.send({
      from: fromAddress,
      to: client.email,
      subject: 'FORGË portal test login link',
      html: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #1a0a2e; padding: 24px; border-radius: 8px; margin-bottom: 24px;">
            <h1 style="color: #D4AF37; margin: 0; font-size: 24px;">FORGË</h1>
          </div>

          <h2>Hi ${client.full_name},</h2>

          <p>Your coach sent a portal access test link. This link expires in 30 minutes.</p>

          <a
            href="${magicLink}"
            style="display: inline-block; background: #D4AF37; color: #000; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; margin: 20px 0;"
          >
            Access My Portal →
          </a>

          <p style="color: #666; font-size: 14px;">
            If you were not expecting this message, you can ignore it.
            <br>This link can only be used once.
          </p>

          <p style="font-size: 12px; color: #999; word-break: break-all;">
            Direct link: ${magicLink}
          </p>
        </body>
        </html>
      `,
    })

    return NextResponse.json({
      success: true,
      clientName: client.full_name,
      clientEmail: client.email,
      magicLink,
      message: `Portal login link sent to ${client.email}.`,
    })
  } catch (err) {
    console.error('[portal/test-magic-link]', err)
    return NextResponse.json(
      { error: 'Failed to send test portal login link' },
      { status: 500 }
    )
  }
}
