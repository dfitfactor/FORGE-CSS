'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'

type SubmissionSummary = {
  id: string
  slug: string
  name: string
  submitted_at: string | null
}

type Props = {
  completedArchive: SubmissionSummary[]
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function PortalCompletedFormsSection({ completedArchive }: Props) {
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

      const response = await fetch('/api/portal/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileType: selectedFile.type || 'application/octet-stream',
          fileSize: selectedFile.size,
          fileData,
          title: title || selectedFile.name,
          notes: notes || null,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error ?? 'Upload failed')
      }

      setSelectedFile(null)
      setTitle('')
      setNotes('')
      setSuccess('File uploaded to your client record.')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  if (completedArchive.length === 0) {
    return null
  }

  return (
    <section style={{ background: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24 }}>
      <div style={{ color: 'var(--app-gold)', fontWeight: 700, fontSize: 12, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 16 }}>
        Completed Form Archive
      </div>

      <div style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.18)', borderRadius: 14, padding: 18, marginBottom: 18 }}>
        <div style={{ color: 'var(--app-text)', fontWeight: 700, marginBottom: 6 }}>Upload a file to your completed forms record</div>
        <div style={{ color: 'var(--app-text-muted)', fontSize: 13, marginBottom: 14 }}>
          Add PDFs, images, lab results, or supporting documents for your coach to review alongside your completed forms.
        </div>

        {error ? (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.22)', color: '#fca5a5', borderRadius: 10, padding: '10px 12px', fontSize: 13, marginBottom: 12 }}>
            {error}
          </div>
        ) : null}

        {success ? (
          <div style={{ background: 'rgba(110,231,183,0.1)', border: '1px solid rgba(110,231,183,0.22)', color: '#6ee7b7', borderRadius: 10, padding: '10px 12px', fontSize: 13, marginBottom: 12 }}>
            {success}
          </div>
        ) : null}

        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.csv,.txt"
              onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
              style={{ display: 'block', width: '100%', color: 'var(--app-text-secondary)', fontSize: 13 }}
            />
            <div style={{ color: 'var(--app-text-muted)', fontSize: 12, marginTop: 6 }}>
              Maximum file size: 10MB
            </div>
          </div>

          {selectedFile ? (
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 12px', color: 'var(--app-text-secondary)', fontSize: 13 }}>
              {selectedFile.name} · {formatFileSize(selectedFile.size)}
            </div>
          ) : null}

          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Document title"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 12px', color: 'var(--app-text)', fontSize: 14 }}
          />

          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional note for your coach"
            rows={3}
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 12px', color: 'var(--app-text)', fontSize: 14, resize: 'vertical' }}
          />

          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading || !selectedFile}
            style={{ background: 'var(--app-gold)', color: '#000', border: 'none', borderRadius: 8, padding: '10px 14px', fontSize: 13, fontWeight: 700, cursor: uploading || !selectedFile ? 'not-allowed' : 'pointer', opacity: uploading || !selectedFile ? 0.6 : 1 }}
          >
            {uploading ? 'Uploading...' : 'Upload File'}
          </button>
        </div>
      </div>

      {completedArchive.map((submission, index) => (
        <div key={submission.id} style={{ borderTop: index === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)', padding: '14px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: 'var(--app-text)', fontWeight: 600 }}>{submission.name}</div>
              <div style={{ color: 'var(--app-text-muted)', fontSize: 13, marginTop: 4 }}>
                Submitted {submission.submitted_at ? new Date(submission.submitted_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'recently'}
              </div>
            </div>
            <Link href={`/portal/forms/completed/${submission.id}`} style={{ color: 'var(--app-gold)', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Open PDF View {'->'}
            </Link>
          </div>
        </div>
      ))}
    </section>
  )
}
