import { NextRequest, NextResponse } from 'next/server'
import { get } from '@vercel/blob'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { getClientDocumentById, normalizeBase64 } from '@/lib/client-documents'

function safeFileName(fileName: string) {
  return fileName.replace(/["\r\n]/g, '_')
}

export async function GET(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  const session = await getSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const client = await db.queryOne<{ coach_id: string }>(
    `SELECT coach_id FROM clients WHERE id = $1`,
    [params.clientId]
  )

  if (!client || (client.coach_id !== session.id && session.role !== 'admin')) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const docId = searchParams.get('id')
  if (!docId) {
    return NextResponse.json({ error: 'Document ID required' }, { status: 400 })
  }

  const document = await getClientDocumentById(params.clientId, docId)
  if (!document) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const fileName = safeFileName(document.file_name ?? 'document')
  const contentType = document.file_type || 'application/octet-stream'

  if (document.blob_url) {
    const blobResult = await get(document.blob_url, { access: 'private', useCache: false })
    if (!blobResult || blobResult.statusCode !== 200) {
      return NextResponse.json({ error: 'Document file not found' }, { status: 404 })
    }

    return new NextResponse(blobResult.stream, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${fileName}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  }

  const normalized = normalizeBase64(document.file_data)
  if (!normalized) {
    return NextResponse.json({ error: 'No file data available' }, { status: 404 })
  }

  return new NextResponse(Buffer.from(normalized, 'base64'), {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${fileName}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
