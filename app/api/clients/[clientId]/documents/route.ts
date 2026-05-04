import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  buildClientDocumentStorageSelect,
  deleteStoredDocumentBlob,
  ensureClientDocumentStorageColumns,
  getClientDocumentById,
  getClientDocumentColumnSupport,
} from '@/lib/client-documents'
import { parseDocumentUpload } from '@/lib/document-upload'

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

    const { searchParams } = new URL(request.url)
    const docId = searchParams.get('id')
    await ensureClientDocumentStorageColumns()
    const columns = await getClientDocumentColumnSupport()

    if (docId) {
      const document = await db.queryOne<{
        id: string
        file_name: string
        file_type: string
        file_size: number
        document_type: string
        title: string | null
        notes: string | null
        include_in_ai: boolean
        created_at: string
        file_data: string | null
        blob_url: string | null
        storage_provider: string | null
      }>(
        `SELECT id, file_name, file_type, file_size, document_type,
                title, notes, include_in_ai, created_at::text,
                encode(file_data, 'base64') as file_data,
                ${buildClientDocumentStorageSelect(columns)}
         FROM client_documents
         WHERE client_id = $1 AND id = $2`,
        [params.clientId, docId]
      )

      if (!document) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 })
      }

      return NextResponse.json({ document })
    }

    const documents = await db.query<{
      id: string
      file_name: string
      file_type: string
      file_size: number
      document_type: string
      title: string | null
      notes: string | null
      include_in_ai: boolean
      created_at: string
      blob_url: string | null
      storage_provider: string | null
    }>(
      `SELECT id, file_name, file_type, file_size, document_type,
              title, notes, include_in_ai, created_at::text,
              ${buildClientDocumentStorageSelect(columns)}
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

    await ensureClientDocumentStorageColumns()
    const contentType = request.headers.get('content-type') || ''
    const body = contentType.includes('application/json')
      ? await request.json().catch(() => null)
      : null

    if (body && typeof body.blobUrl === 'string' && body.blobUrl.trim()) {
      const doc = await db.queryOne<{ id: string }>(
        `INSERT INTO client_documents
           (client_id, uploaded_by, file_name, file_type, file_size, file_data,
            document_type, title, notes, include_in_ai, blob_url, storage_provider)
         VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          params.clientId,
          session.id,
          String(body.fileName ?? ''),
          typeof body.fileType === 'string' && body.fileType.trim() ? body.fileType : 'application/octet-stream',
          Number(body.fileSize) || 0,
          typeof body.documentType === 'string' && body.documentType.trim() ? body.documentType : 'general',
          typeof body.title === 'string' && body.title.trim() ? body.title : String(body.fileName ?? ''),
          typeof body.notes === 'string' && body.notes.trim() ? body.notes : null,
          body.includeInAi !== false,
          body.blobUrl.trim(),
          typeof body.storageProvider === 'string' && body.storageProvider.trim() ? body.storageProvider : 'vercel_blob',
        ]
      )

      return NextResponse.json({ success: true, documentId: doc?.id })
    }

    const {
      fileName,
      fileType,
      fileSize,
      fileBuffer,
      documentType,
      title,
      notes,
      includeInAi,
    } = await parseDocumentUpload(request)

    const doc = await db.queryOne<{ id: string }>(
      `INSERT INTO client_documents
         (client_id, uploaded_by, file_name, file_type, file_size, file_data,
          document_type, title, notes, include_in_ai)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        params.clientId,
        session.id,
        fileName,
        fileType,
        fileSize || 0,
        fileBuffer,
        documentType || 'general',
        title || null,
        notes || null,
        includeInAi !== false,
      ]
    )

    return NextResponse.json({ success: true, documentId: doc?.id })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    const status = [
      'A file is required',
      'fileName and fileData are required',
      'File size must be under 10MB',
      'Invalid file data',
    ].includes(msg) ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
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

    const existing = await getClientDocumentById(params.clientId, docId)
    if (existing?.blob_url) {
      await deleteStoredDocumentBlob(existing.blob_url)
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
