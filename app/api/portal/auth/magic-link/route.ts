import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { db } from '@/lib/db'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    console.log('[magic-link] RESEND_API_KEY set:', !!process.env.RESEND_API_KEY)
    console.log('[magic-link] FROM:', process.env.RESEND_FROM_EMAIL || 'onboarding@dfitfactor.com')

    const { email } = await request.json()
    if (!email) {
      return NextResponse.json(
        { error: 'Email required' }, { status: 400 }
      )
    }

    const client = await db.queryOne<{ id: string; full_name: string }>(
      `SELECT id, full_name FROM clients
       WHERE LOWER(email) = LOWER($1) AND status != 'archived'`,
      [email]
    )

    if (!client) {
      console.log('[magic-link] no client found for email:', email)
      return NextResponse.json({ success: true })
    }

    console.log('[magic-link] client found:', client.full_name)

    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000)

    await db.query(
      `INSERT INTO client_auth_tokens
         (client_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [client.id, token, expiresAt.toISOString()]
    )

    console.log('[magic-link] token saved for client:', client.id)

    const baseUrl = process.env.NEXTAUTH_URL ||
      'https://forge-css.vercel.app'
    const magicLink = `${baseUrl}/api/portal/auth/verify?token=${token}`

    console.log('[magic-link] magic link:', magicLink)

    const fromAddress = process.env.RESEND_FROM_EMAIL ||
      'FORGE <onboarding@dfitfactor.com>'

    const resend = new Resend(process.env.RESEND_API_KEY)

    try {
      const result = await resend.emails.send({
        from: fromAddress,
        to: email,
        subject: 'Your FORGE login link',
        html: `
          <!DOCTYPE html>
          <html>
          <body style="font-family: Arial, sans-serif;
            max-width: 600px; margin: 0 auto; padding: 20px;">

            <div style="background: #1a0a2e; padding: 24px;
              border-radius: 8px; margin-bottom: 24px;">
              <h1 style="color: #D4AF37; margin: 0; font-size: 24px;">
                FORGE
              </h1>
            </div>

            <h2>Hi ${client.full_name},</h2>

            <p>Click the button below to access your FORGE portal.
            This link expires in 30 minutes.</p>

            <a href="${magicLink}"
              style="display: inline-block; background: #D4AF37;
              color: #000; padding: 14px 28px; border-radius: 8px;
              text-decoration: none; font-weight: bold;
              font-size: 16px; margin: 20px 0;">
              Access My Portal ->
            </a>

            <p style="color: #666; font-size: 14px;">
              If you didn't request this, ignore this email.
              <br>This link can only be used once.
            </p>

            <hr style="border: none; border-top: 1px solid #eee;
              margin: 24px 0;">
            <p style="color: #999; font-size: 12px;">
              DFitFactor · FORGE Platform
            </p>
          </body>
          </html>
        `
      })
      console.log('[magic-link] email sent:', JSON.stringify(result))
    } catch (emailErr: any) {
      console.error('[magic-link] email FAILED:', emailErr.message)
      console.error('[magic-link] full error:', JSON.stringify(emailErr))
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[magic-link]', err)
    return NextResponse.json(
      { error: 'Failed to send login link' }, { status: 500 }
    )
  }
}

