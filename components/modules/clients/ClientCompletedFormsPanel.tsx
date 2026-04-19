'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { FileText, Upload, X } from 'lucide-react'

type SubmissionSummary = {
  id: string
  slug: string
  name: string
  submitted_at: string | null
  signature_data: string | null
}

type Props = {
  clientId: string
  submissions: SubmissionSummary[]
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ClientCompletedFormsPanel({ clientId, submissions }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  function handleFileChange(file: File | null) {
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setError('File must be under 10MB.')
      return
    }

    setError('')
    setSuccess('')
    setSelectedFile(file)
    setTitle((current) => current || file.name.replace(/\.[^/.]+$/, ''))
  }

  async function handleUpload() {
    if (!selectedFile) {
      setError('Please select a file to upload.')
      return
    }

    setUploading(true)
    setError('')
    setSuccess('')

    try {
      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsDataURL(selectedFile)
      })

      const response = await fetch(`/api/clients/${clientId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileType: selectedFile.type || 'application/octet-stream',
          fileSize: selectedFile.size,
          fileData,
          documentType: 'questionnaire',
          title: title || selectedFile.name,
          notes: notes || 'Uploaded from completed forms archive.',
          includeInAi: true,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error ?? 'Upload failed')
      }

      setSelectedFile(null)
      setTitle('')
      setNotes('')
      setSuccess('File uploaded to client documents.')
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="bg-[#111111] border border-white/6 rounded-2xl p-6">
      <div className="text-xs uppercase tracking-[0.2em] text-[#D4AF37] font-semibold mb-4">Client Form Archive</div>

      <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.04] p-4 mb-5">
        <div className="flex items-center gap-2 text-white font-medium">
          <Upload size={15} className="text-[#D4AF37]" />
          Upload Supporting File
        </div>
        <p className="text-xs text-white/40 mt-2">
          Add PDFs, images, or completed form files directly to this client record from the completed forms section.
        </p>

        {error ? (
          <div className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>
        ) : null}

        {success ? (
          <div className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{success}</div>
        ) : null}

        <div className="mt-4 grid gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.csv,.txt"
            onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
            className="block w-full text-sm text-white/70 file:mr-4 file:rounded-lg file:border-0 file:bg-white/8 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-white/12"
          />

          {selectedFile ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm text-white">{selectedFile.name}</div>
                <div className="text-xs text-white/35">{formatFileSize(selectedFile.size)}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null)
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
                className="text-white/35 hover:text-white transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          ) : null}

          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Document title"
            className="forge-input"
          />

          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional note"
            rows={3}
            className="forge-input resize-none"
          />

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading || !selectedFile}
              className="forge-btn-gold disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Upload File'}
            </button>

            <Link href={`/clients/${clientId}/documents`} className="text-sm text-white/50 hover:text-white transition-colors">
              Open documents
            </Link>
          </div>
        </div>
      </div>

      {submissions.length === 0 ? (
        <div className="text-sm text-white/40">No completed forms have been submitted yet.</div>
      ) : (
        <div className="space-y-3">
          {submissions.map((submission) => (
            <div key={submission.id} className="rounded-xl border border-white/6 bg-white/[0.02] px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-white font-medium">
                  <FileText size={15} className="text-[#D4AF37]" />
                  {submission.name}
                </div>
                <div className="text-xs text-white/35 mt-1">
                  Submitted {submission.submitted_at ? new Date(submission.submitted_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'recently'}
                  {submission.signature_data ? ` · Signed by ${submission.signature_data}` : ''}
                </div>
              </div>
              <Link href={`/clients/${clientId}/forms/${submission.id}`} className="forge-btn-secondary text-sm whitespace-nowrap">
                Open PDF View
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
