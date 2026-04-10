import { readFile } from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'
import { getBrandLogoUrl, DEFAULT_LOGO_SRC } from '@/lib/branding'

function decodeDataUrl(value: string) {
  const match = value.match(/^data:(.+?);base64,(.+)$/)
  if (!match) return null
  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  }
}

async function readDefaultLogo() {
  const logoPath = path.join(process.cwd(), 'public', 'Forge-Logo.png')
  const buffer = await readFile(logoPath)
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}

export async function GET() {
  try {
    const logoUrl = await getBrandLogoUrl()

    if (!logoUrl || logoUrl === DEFAULT_LOGO_SRC) {
      return await readDefaultLogo()
    }

    if (logoUrl.startsWith('data:image/')) {
      const decoded = decodeDataUrl(logoUrl)
      if (decoded) {
        return new NextResponse(decoded.buffer, {
          headers: {
            'Content-Type': decoded.contentType,
            'Cache-Control': 'no-store, max-age=0',
          },
        })
      }
    }

    const response = await fetch(logoUrl, { cache: 'no-store' })
    if (!response.ok) {
      return await readDefaultLogo()
    }

    const contentType = response.headers.get('content-type') || 'image/png'
    const arrayBuffer = await response.arrayBuffer()
    return new NextResponse(Buffer.from(arrayBuffer), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  } catch (error) {
    console.error('[branding/icon] GET error:', error)
    return await readDefaultLogo()
  }
}
