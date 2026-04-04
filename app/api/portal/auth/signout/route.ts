import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(
    new URL('/portal/auth', request.url)
  )
  response.cookies.delete('forge_client_session')
  return response
}
