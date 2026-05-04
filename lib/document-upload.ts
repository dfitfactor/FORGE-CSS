export const MAX_DOCUMENT_UPLOAD_BYTES = 10 * 1024 * 1024

type ParsedUploadPayload = {
  fileName: string
  fileType: string
  fileSize: number
  fileBuffer: Buffer
  documentType?: string | null
  title?: string | null
  notes?: string | null
  includeInAi: boolean
}

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

function extractString(value: FormDataEntryValue | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function extractBoolean(value: FormDataEntryValue | null | undefined, defaultValue = true): boolean {
  if (typeof value !== 'string') return defaultValue
  const normalized = value.trim().toLowerCase()
  if (['false', '0', 'off', 'no'].includes(normalized)) return false
  if (['true', '1', 'on', 'yes'].includes(normalized)) return true
  return defaultValue
}

export async function parseDocumentUpload(request: Request): Promise<ParsedUploadPayload> {
  const contentType = request.headers.get('content-type') || ''

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      throw new Error('A file is required')
    }

    if (file.size > MAX_DOCUMENT_UPLOAD_BYTES) {
      throw new Error('File size must be under 10MB')
    }

    const arrayBuffer = await file.arrayBuffer()
    const fileBuffer = Buffer.from(arrayBuffer)

    return {
      fileName: file.name,
      fileType: file.type || 'application/octet-stream',
      fileSize: file.size,
      fileBuffer,
      documentType: extractString(formData.get('documentType')),
      title: extractString(formData.get('title')) ?? file.name,
      notes: extractString(formData.get('notes')),
      includeInAi: extractBoolean(formData.get('includeInAi'), true),
    }
  }

  const body = await request.json()
  const { fileName, fileType, fileSize, fileData, documentType, title, notes, includeInAi } = body ?? {}

  if (!fileName || !fileData) {
    throw new Error('fileName and fileData are required')
  }

  if (Number(fileSize) > MAX_DOCUMENT_UPLOAD_BYTES) {
    throw new Error('File size must be under 10MB')
  }

  const normalized = normalizeBase64(fileData)
  if (!normalized) {
    throw new Error('Invalid file data')
  }

  return {
    fileName: String(fileName),
    fileType: typeof fileType === 'string' && fileType.trim() ? fileType : 'application/octet-stream',
    fileSize: Number(fileSize) || 0,
    fileBuffer: Buffer.from(normalized, 'base64'),
    documentType: typeof documentType === 'string' ? documentType : null,
    title: typeof title === 'string' && title.trim() ? title : String(fileName),
    notes: typeof notes === 'string' && notes.trim() ? notes : null,
    includeInAi: includeInAi !== false,
  }
}
