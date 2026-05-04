import { NextRequest, NextResponse } from 'next/server'
import { getClientSession } from '@/lib/client-auth'
import { db } from '@/lib/db'
import { parseDocumentUpload } from '@/lib/document-upload'

export async function POST(request: NextRequest) {
  const session = await getClientSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { fileName, fileType, fileSize, fileBuffer, title, notes } = await parseDocumentUpload(request)

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
    const status = [
      'A file is required',
      'fileName and fileData are required',
      'File size must be under 10MB',
      'Invalid file data',
    ].includes(message) ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
