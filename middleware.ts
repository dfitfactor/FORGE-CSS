import { jwtVerify } from 'jose'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const COOKIE_NAME = 'forge_session'
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'forge-css-dev-secret-change-in-production'
)

async function hasValidSession(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value
  if (!token) return false

  try {
    await jwtVerify(token, JWT_SECRET)
    return true
  } catch {
    return false
  }
}

export async function middleware(request: NextRequest) {
  const { nextUrl } = request
  const isAuthenticated = await hasValidSession(request)
  const isAuthPage = nextUrl.pathname === '/auth/login'

  if (isAuthPage && isAuthenticated) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (!isAuthenticated && !isAuthPage) {
    const loginUrl = new URL('/auth/login', request.url)
    loginUrl.searchParams.set('from', nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/clients/:path*',
    '/ai-insights/:path*',
    '/nutrition/:path*',
    '/auth/login',
  ],
}
