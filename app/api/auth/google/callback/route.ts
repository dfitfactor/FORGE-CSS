import { NextRequest } from 'next/server'

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function renderHtml(title: string, body: string) {
  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(title)}</title>
      </head>
      <body style="font-family: Arial, sans-serif; padding: 32px; line-height: 1.5;">
        ${body}
      </body>
    </html>
  `
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')

  if (!code) {
    const html = renderHtml('Google Calendar OAuth Error', '<h1>Missing authorization code</h1>')
    return new Response(html, {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    const html = renderHtml(
      'Google Calendar OAuth Error',
      '<h1>Missing Google OAuth environment variables</h1>'
    )
    return new Response(html, {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  const tokenData = (await tokenResponse.json().catch(() => null)) as
    | { refresh_token?: string; error?: string; error_description?: string }
    | null

  if (!tokenResponse.ok || !tokenData?.refresh_token) {
    const message = tokenData?.error_description || tokenData?.error || 'No refresh token returned from Google.'
    const html = renderHtml(
      'Google Calendar OAuth Error',
      `<h1>Google Calendar Connection Failed</h1><p>${escapeHtml(message)}</p>`
    )
    return new Response(html, {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  const html = renderHtml(
    'Google Calendar Connected',
    `
      <h1>Google Calendar Connected</h1>
      <p>Copy this refresh token and add it to Vercel as GOOGLE_REFRESH_TOKEN:</p>
      <code style="display:block;padding:16px;background:#f4f4f4;border-radius:8px;word-break:break-all;">${escapeHtml(tokenData.refresh_token)}</code>
      <p>Then delete the /api/auth/google routes from your codebase.</p>
    `
  )

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' },
  })
}
