import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'

const JWT_SECRET = process.env.JWT_SECRET || 'forge-client-secret-2026'

export function createClientToken(clientId: string, email: string): string {
  const payload = {
    clientId,
    email,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64')
  const signature = Buffer.from(
    encoded + JWT_SECRET
  ).toString('base64').slice(0, 32)
  return `${encoded}.${signature}`
}

export function verifyClientToken(
  token: string
): { clientId: string; email: string } | null {
  try {
    const [encoded, signature] = token.split('.')
    const expectedSig = Buffer.from(
      encoded + JWT_SECRET
    ).toString('base64').slice(0, 32)
    if (signature !== expectedSig) return null
    const payload = JSON.parse(Buffer.from(encoded, 'base64').toString())
    if (payload.exp < Date.now()) return null
    return { clientId: payload.clientId, email: payload.email }
  } catch {
    return null
  }
}

export async function getClientSession(
  request?: NextRequest
): Promise<{ clientId: string; email: string } | null> {
  try {
    let token: string | undefined

    if (request) {
      token = request.cookies.get('forge_client_session')?.value
    } else {
      const cookieStore = cookies()
      token = cookieStore.get('forge_client_session')?.value
    }

    if (!token) return null
    return verifyClientToken(token)
  } catch {
    return null
  }
}
