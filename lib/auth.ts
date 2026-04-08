import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from './db'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'forge-css-dev-secret-change-in-production'
)

const COOKIE_NAME = 'forge_session'
const TOKEN_EXPIRY = '7d'
const SUPERUSER_EMAIL = 'coach@dfitfactor.com'

export type AuthUser = {
  id: string
  email: string
  fullName: string
  role: 'admin' | 'coach' | 'client'
}

export type JWTPayload = {
  sub: string
  email: string
  fullName: string
  role: string
  iat?: number
  exp?: number
}

function normalizeRole(email: string, role: string): AuthUser['role'] {
  if (email.toLowerCase() === SUPERUSER_EMAIL) {
    return 'admin'
  }

  if (role === 'admin' || role === 'coach' || role === 'client') {
    return role
  }

  return 'coach'
}

export async function signToken(payload: Omit<JWTPayload, 'iat' | 'exp'>) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(JWT_SECRET)
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as unknown as JWTPayload
  } catch {
    return null
  }
}

export async function createSession(userId: string): Promise<string> {
  const user = await db.queryOne<{ id: string; email: string; full_name: string; role: string }>(
    'SELECT id, email, full_name, role FROM users WHERE id = $1 AND is_active = true',
    [userId]
  )

  if (!user) throw new Error('User not found')

  const effectiveRole = normalizeRole(user.email, user.role)

  const token = await signToken({
    sub: user.id,
    email: user.email,
    fullName: user.full_name,
    role: effectiveRole,
  })

  return token
}

export async function getSession(request?: NextRequest): Promise<AuthUser | null> {
  let token: string | undefined

  if (request) {
    token = request.cookies.get(COOKIE_NAME)?.value
  } else {
    const cookieStore = cookies()
    token = cookieStore.get(COOKIE_NAME)?.value
  }

  if (!token) return null

  const payload = await verifyToken(token)
  if (!payload) return null

  return {
    id: payload.sub,
    email: payload.email,
    fullName: payload.fullName,
    role: normalizeRole(payload.email, payload.role),
  }
}

export function setSessionCookie(token: string) {
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })
}

export function clearSessionCookie() {
  cookies().delete(COOKIE_NAME)
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function requireRole(user: AuthUser | null, ...roles: AuthUser['role'][]) {
  if (!user) throw new Error('Unauthenticated')
  if (!roles.includes(user.role)) throw new Error('Unauthorized')
  return user
}

export function canAccessClient(
  user: AuthUser,
  clientCoachId: string
): boolean {
  if (user.role === 'admin') return true
  if (user.role === 'coach' && user.id === clientCoachId) return true
  return false
}

export function getEffectiveRole(email: string, role: string): AuthUser['role'] {
  return normalizeRole(email, role)
}
