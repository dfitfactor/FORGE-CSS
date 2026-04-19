import { NextRequest, NextResponse } from 'next/server'
import { getClientSession } from '@/lib/client-auth'
import { db } from '@/lib/db'

function normalizeBase64(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null

  let value = String(input).trim()
  value = value.replace(/^data:.*?;base64,/i, '')
  value = value.replace(/\s+/g, '')
  value = value.replace(/-/g, '+').replace(/_/g, '/')

  if (!value) return null

  const padding = value.length % 4
  if (padding !== 0) {
    value = value.padEnd(value.length + (4 - padding), '=')
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null
  return value
}

export async function POST(request: NextRequest) {
  const session = await getClientSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { fileName, fileType, fileSize, fileData, title, notes } = body ?? {}

    if (!fileName || !fileType || !fileData) {
      return NextResponse.json({ error: 'fileName, fileType, and fileData are required' }, { status: 400 })
    }

    if (Number(fileSize) > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be under 10MB' }, { status: 400 })
    }

    const normalized = normalizeBase64(fileData)
    if (!normalized) {
      return NextResponse.json({ error: 'Invalid file data' }, { status: 400 })
    }

    const fileBuffer = Buffer.from(normalized, 'base64')

    await db.query(
      `INSERT INTO client_documents
         (client_id, file_name, file_type, file_size, file_data, document_type, title, notes, include_in_ai)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        session.clientId,
        fileName,
        fileType,
        Number(fileSize) || 0,
        fileBuffer,
        'questionnaire',
        title || fileName,
        notes || 'Uploaded from client portal completed forms section.',
        true,
      ]
    )

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    console.error('[portal/documents] POST error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
