import { NextResponse } from 'next/server'
import { getBrandLogoUrl } from '@/lib/branding'

export async function GET() {
  const logoUrl = await getBrandLogoUrl()
  return NextResponse.json(
    { logoUrl },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  )
}
