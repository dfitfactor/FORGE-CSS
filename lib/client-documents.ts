import * as XLSX from 'xlsx'
import { del, get } from '@vercel/blob'
import { db } from '@/lib/db'

export type ClientDocumentColumnSupport = {
  blobUrl: boolean
  storageProvider: boolean
}

export type StoredClientDocument = {
  id?: string
  document_type: string | null
  title: string | null
  notes: string | null
  file_type: string | null
  file_name: string | null
  file_data: string | null
  blob_url: string | null
  storage_provider: string | null
  include_in_ai?: boolean
  file_size?: number | null
  created_at?: string | null
}

export async function ensureClientDocumentStorageColumns() {
  try {
    await db.query(`ALTER TABLE client_documents
      ADD COLUMN IF NOT EXISTS blob_url TEXT,
      ADD COLUMN IF NOT EXISTS storage_provider TEXT`)
  } catch (err) {
    console.warn('[client-documents] ensureClientDocumentStorageColumns skipped:', err)
  }
}

export async function getClientDocumentColumnSupport(): Promise<ClientDocumentColumnSupport> {
  const rows = await db.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'client_documents'
       AND column_name IN ('blob_url', 'storage_provider')`
  )

  const columns = new Set(rows.map((row) => row.column_name))

  return {
    blobUrl: columns.has('blob_url'),
    storageProvider: columns.has('storage_provider'),
  }
}

function qualifyColumn(alias: string | undefined, column: string) {
  return alias ? `${alias}.${column}` : column
}

export function buildClientDocumentStorageSelect(columns: ClientDocumentColumnSupport, alias?: string) {
  const blobUrlExpr = columns.blobUrl
    ? `${qualifyColumn(alias, 'blob_url')} AS blob_url`
    : 'NULL::text AS blob_url'
  const storageProviderExpr = columns.storageProvider
    ? `${qualifyColumn(alias, 'storage_provider')} AS storage_provider`
    : 'NULL::text AS storage_provider'

  return `${blobUrlExpr}, ${storageProviderExpr}`
}

export async function listAiClientDocuments(clientId: string, limit: number) {
  await ensureClientDocumentStorageColumns()
  const columns = await getClientDocumentColumnSupport()
  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 20))

  return db.query<StoredClientDocument>(
    `SELECT document_type, title, notes, file_type, file_name,
            encode(file_data, 'base64') AS file_data,
            ${buildClientDocumentStorageSelect(columns)}
     FROM client_documents
     WHERE client_id = $1
       AND include_in_ai = true
     ORDER BY created_at DESC
     LIMIT ${safeLimit}`,
    [clientId]
  )
}

export async function getClientDocumentById(clientId: string, docId: string) {
  await ensureClientDocumentStorageColumns()
  const columns = await getClientDocumentColumnSupport()

  return db.queryOne<StoredClientDocument>(
    `SELECT id, document_type, title, notes, file_type, file_name, file_size,
            include_in_ai, created_at::text,
            encode(file_data, 'base64') AS file_data,
            ${buildClientDocumentStorageSelect(columns)}
     FROM client_documents
     WHERE client_id = $1
       AND id = $2`,
    [clientId, docId]
  )
}

export function normalizeBase64(input: string | null | undefined): string | null {
  if (input == null) return null

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

async function bufferFromBlobUrl(blobUrl: string) {
  try {
    const blobResult = await get(blobUrl, { access: 'private', useCache: false })
    if (!blobResult || blobResult.statusCode !== 200) return null

    const arrayBuffer = await new Response(blobResult.stream).arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch {
    return null
  }
}

export async function readStoredDocumentBuffer(doc: Pick<StoredClientDocument, 'blob_url' | 'file_data'>) {
  if (doc.blob_url) {
    return bufferFromBlobUrl(doc.blob_url)
  }

  const normalized = normalizeBase64(doc.file_data)
  if (!normalized) return null
  return Buffer.from(normalized, 'base64')
}

function normalizeHeader(header: string) {
  return header.toLowerCase().replace(/\s+/g, ' ').trim()
}

export function parseSpreadsheetNumber(value: unknown) {
  const cleaned = String(value ?? '').replace(/[^0-9.\-]/g, '').trim()
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

export async function readStoredDocumentTextPreview(doc: StoredClientDocument, charLimit = 2500) {
  const fileType = doc.file_type?.toLowerCase() ?? ''
  const fileName = doc.file_name?.toLowerCase() ?? ''
  const buffer = await readStoredDocumentBuffer(doc)
  if (!buffer) return ''

  try {
    if (
      fileType.includes('text') ||
      fileType.includes('plain') ||
      fileType.includes('csv') ||
      fileName.endsWith('.txt') ||
      fileName.endsWith('.md') ||
      fileName.endsWith('.csv')
    ) {
      return buffer.toString('utf-8').replace(/\s+/g, ' ').trim().slice(0, charLimit)
    }

    const isSpreadsheet =
      fileType.includes('spreadsheet') ||
      fileType.includes('excel') ||
      fileType.includes('sheet') ||
      fileName.endsWith('.xls') ||
      fileName.endsWith('.xlsx')

    if (!isSpreadsheet) return ''

    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const previews = workbook.SheetNames.slice(0, 2).map((sheetName) => {
      const worksheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(worksheet, {
        header: 1,
        blankrows: false,
        raw: false,
        defval: '',
      })

      if (!rows.length) return ''

      const headerIndex = rows.findIndex((row) =>
        row.some((cell) => String(cell).trim().length > 0)
      )
      if (headerIndex === -1) return ''

      const headerRow = rows[headerIndex].map((cell) => String(cell).trim())
      const bodyRows = rows
        .slice(headerIndex + 1)
        .filter((row) => row.some((cell) => String(cell).trim().length > 0))
        .slice(0, 10)

      const lineItems = bodyRows.map((row) =>
        headerRow
          .slice(0, 8)
          .map((header, index) => {
            const value = String(row[index] ?? '').trim()
            return header && value ? `${header}: ${value}` : ''
          })
          .filter(Boolean)
          .join(' | ')
      )

      return [`[Sheet: ${sheetName}]`, ...lineItems].filter(Boolean).join('\n')
    })

    return previews.filter(Boolean).join('\n').slice(0, charLimit)
  } catch {
    return ''
  }
}

export async function deleteStoredDocumentBlob(blobUrl: string | null | undefined) {
  if (!blobUrl) return
  await del(blobUrl)
}
