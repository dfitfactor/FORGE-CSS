import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

function normalizeBase64(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null

  let s = String(input).trim()
  s = s.replace(/^data:.*?;base64,/i, '')
  s = s.replace(/\s+/g, '')
  s = s.replace(/-/g, '+').replace(/_/g, '/')

  if (s.length === 0) return null

  const padding = s.length % 4
  if (padding !== 0) {
    s = s.padEnd(s.length + (4 - padding), '=')
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return null
  return s
}

// GET /api/clients/[clientId]/documents
export async function GET(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const client = await db.queryOne<{ coach_id: string }>(
      `SELECT coach_id FROM clients WHERE id = $1`, [params.clientId]
    )
    if (!client || (client.coach_id !== session.id && session.role !== 'admin')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const documents = await db.query<{
      id: string; file_name: string; file_type: string; file_size: number
      document_type: string; title: string | null; notes: string | null
      include_in_ai: boolean; created_at: string
    }>(
      `SELECT id, file_name, file_type, file_size, document_type,
              title, notes, include_in_ai, created_at::text
       FROM client_documents
       WHERE client_id = $1
       ORDER BY created_at DESC`,
      [params.clientId]
    )

    return NextResponse.json({ documents })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// POST /api/clients/[clientId]/documents
export async function POST(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const client = await db.queryOne<{ coach_id: string }>(
      `SELECT coach_id FROM clients WHERE id = $1`, [params.clientId]
    )
    if (!client || (client.coach_id !== session.id && session.role !== 'admin')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const body = await request.json()
    const { fileName, fileType, fileSize, fileData, documentType, title, notes, includeInAi } = body

    if (!fileName || !fileType || !fileData) {
      return NextResponse.json({ error: 'fileName, fileType, and fileData are required' }, { status: 400 })
    }

    if (fileSize > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be under 10MB' }, { status: 400 })
    }

    const normalized = normalizeBase64(fileData)
    if (!normalized) {
      return NextResponse.json({ error: 'Invalid file data' }, { status: 400 })
    }

    const fileBuffer = Buffer.from(normalized, 'base64')

    const doc = await db.queryOne<{ id: string }>(
      `INSERT INTO client_documents
         (client_id, uploaded_by, file_name, file_type, file_size, file_data,
          document_type, title, notes, include_in_ai)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        params.clientId, session.id, fileName, fileType,
        fileSize || 0, fileBuffer,
        documentType || 'general', title || null, notes || null,
        includeInAi !== false
      ]
    )

    return NextResponse.json({ success: true, documentId: doc?.id })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// DELETE /api/clients/[clientId]/documents?id=xxx
export async function DELETE(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const docId = searchParams.get('id')
    if (!docId) return NextResponse.json({ error: 'Document ID required' }, { status: 400 })

    const client = await db.queryOne<{ coach_id: string }>(
      `SELECT coach_id FROM clients WHERE id = $1`, [params.clientId]
    )
    if (!client || (client.coach_id !== session.id && session.role !== 'admin')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    await db.query(
      `DELETE FROM client_documents WHERE id = $1 AND client_id = $2`,
      [docId, params.clientId]
    )

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
