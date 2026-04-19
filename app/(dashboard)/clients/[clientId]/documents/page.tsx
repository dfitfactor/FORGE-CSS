'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ClientDocumentInsightPanel } from '@/components/modules/clients/ClientDocumentInsightPanel'
import {
  ArrowLeft, Upload, FileText, File, Trash2, Brain, Eye,
  Loader2, CheckCircle, AlertCircle, X, Plus
} from 'lucide-react'

type Doc = {
  id: string; file_name: string; file_type: string; file_size: number
  document_type: string; title: string | null; notes: string | null
  include_in_ai: boolean; created_at: string
}

const DOC_TYPES = [
  { value: 'general', label: 'General' },
  { value: 'lab_report', label: 'Lab Report' },
  { value: 'medical_history', label: 'Medical History' },
  { value: 'intake_form', label: 'Intake Form' },
  { value: 'assessment', label: 'Assessment' },
  { value: 'questionnaire', label: 'Questionnaire' },
  { value: 'protocol_reference', label: 'Client Protocol' },
  { value: 'nutrition_log', label: 'Nutrition Log' },
  { value: 'progress_photo', label: 'Progress Photo' },
]

const DOC_TYPE_COLORS: Record<string, string> = {
  lab_report: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  medical_history: 'bg-red-500/10 text-red-400 border-red-500/20',
  intake_form: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  assessment: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  questionnaire: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  protocol_reference: 'bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/20',
  nutrition_log: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  progress_photo: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  general: 'bg-white/6 text-white/50 border-white/10',
}

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatDate(str: string) {
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function DocumentsPage() {
  const params = useParams<{ clientId: string }>()
  const clientId = params?.clientId as string

  const [docs, setDocs] = useState<Doc[]>([])
  const [clientName, setClientName] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [filterType, setFilterType] = useState('all')

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [docType, setDocType] = useState('general')
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [includeInAi, setIncludeInAi] = useState(true)

  useEffect(() => {
    if (!clientId) return
    fetch('/api/clients/' + clientId).then(r => r.json()).then(d => setClientName(d.client?.full_name ?? '')).catch(() => {})
    loadDocs()
  }, [clientId])

  function loadDocs() {
    fetch('/api/clients/' + clientId + '/documents')
      .then(r => r.json())
      .then(d => { setDocs(d.documents ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  function handleFileSelect(file: File) {
    if (file.size > 10 * 1024 * 1024) { setError('File must be under 10MB'); return }
    setSelectedFile(file)
    if (!title) setTitle(file.name.replace(/\.[^/.]+$/, ''))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  async function handleUpload() {
    if (!selectedFile) { setError('Please select a file'); return }
    setUploading(true); setError('')
    try {
      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsDataURL(selectedFile)
      })
      const res = await fetch('/api/clients/' + clientId + '/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: selectedFile.name, fileType: selectedFile.type,
          fileSize: selectedFile.size, fileData,
          documentType: docType, title: title || selectedFile.name,
          notes: notes || undefined, includeInAi,
        }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? 'Upload failed'); return }
      setSuccess('Document uploaded')
      setShowUpload(false); setSelectedFile(null); setTitle(''); setNotes(''); setDocType('general'); setIncludeInAi(true)
      loadDocs()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally { setUploading(false) }
  }

  async function handleView(doc: Doc) {
    try {
      const res = await fetch(`/api/clients/${clientId}/documents?id=${doc.id}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.document?.file_data) {
        alert(data.error ?? 'No file data available')
        return
      }

      const byteChars = atob(data.document.file_data)
      const byteArr = new Uint8Array(byteChars.length)
      for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i)
      const blob = new Blob([byteArr], { type: data.document.file_type ?? 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch { alert('Could not open file') }
  }

  async function handleDelete(docId: string, fileName: string) {
    if (!confirm('Delete "' + fileName + '"?')) return
    await fetch('/api/clients/' + clientId + '/documents?id=' + docId, { method: 'DELETE' })
    setDocs(prev => prev.filter(d => d.id !== docId))
  }

  const aiDocs = docs.filter(d => d.include_in_ai)
  const filtered = filterType === 'all' ? docs : docs.filter(d => d.document_type === filterType)

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={'/clients/' + clientId} className="w-9 h-9 rounded-lg bg-white/6 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors">
              <ArrowLeft size={16} />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-white">Documents</h1>
              <p className="text-sm text-white/40">{clientName}</p>
            </div>
          </div>
          <button onClick={() => setShowUpload(true)} className="forge-btn-gold text-sm flex items-center gap-2">
            <Plus size={15} /> Upload Document
          </button>
        </div>

        {success && <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3"><CheckCircle size={16} className="text-emerald-400" /><span className="text-sm text-emerald-400">{success}</span></div>}
        {error && <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3"><AlertCircle size={16} className="text-red-400" /><span className="text-sm text-red-400 flex-1">{error}</span><button onClick={() => setError('')}><X size={14} className="text-red-400/60" /></button></div>}

        {/* Filter tabs */}
        {docs.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setFilterType('all')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterType === 'all' ? 'bg-[#D4AF37] text-black' : 'bg-white/6 text-white/40 hover:text-white'}`}>All ({docs.length})</button>
            {DOC_TYPES.map(t => {
              const count = docs.filter(d => d.document_type === t.value).length
              if (count === 0) return null
              return <button key={t.value} onClick={() => setFilterType(t.value)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterType === t.value ? 'bg-[#D4AF37] text-black' : 'bg-white/6 text-white/40 hover:text-white'}`}>{t.label} ({count})</button>
            })}
          </div>
        )}

        {/* Upload panel */}
        {showUpload && (
          <div className="bg-[#111111] border border-[#D4AF37]/20 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white uppercase tracking-widest font-mono">Upload Document</h2>
              <button onClick={() => { setShowUpload(false); setSelectedFile(null); setError('') }} className="text-white/30 hover:text-white"><X size={16} /></button>
            </div>
            {!selectedFile ? (
              <div onDrop={handleDrop} onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onClick={() => fileRef.current?.click()}
                className={'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ' + (dragOver ? 'border-[#D4AF37] bg-[#D4AF37]/5' : 'border-white/10 hover:border-white/25')}>
                <Upload size={28} className="mx-auto mb-3 text-white/25" />
                <p className="text-sm text-white/50">Drop a file here or <span className="text-[#D4AF37]">browse</span></p>
                <p className="text-xs text-white/25 mt-1">PDF, Word, Excel, images — max 10MB</p>
                <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.txt,.csv"
                  onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]) }} />
              </div>
            ) : (
              <div className="flex items-center gap-3 bg-white/4 border border-white/8 rounded-xl p-3">
                <FileText size={20} className="text-[#D4AF37] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{selectedFile.name}</div>
                  <div className="text-xs text-white/35">{formatSize(selectedFile.size)}</div>
                </div>
                <button onClick={() => setSelectedFile(null)} className="text-white/30 hover:text-white"><X size={14} /></button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className="forge-label">Title</label><input value={title} onChange={e => setTitle(e.target.value)} className="forge-input" placeholder="Document title" /></div>
              <div className="col-span-2"><label className="forge-label">Document Type</label><select value={docType} onChange={e => setDocType(e.target.value)} className="forge-input">{DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
              <div className="col-span-2"><label className="forge-label">Notes (optional)</label><textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className="forge-input resize-none" placeholder="Any context about this document..." /></div>
            </div>
            <div onClick={() => setIncludeInAi(!includeInAi)} className={'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ' + (includeInAi ? 'bg-[#D4AF37]/8 border-[#D4AF37]/25' : 'bg-white/3 border-white/8')}>
              <Brain size={16} className={includeInAi ? 'text-[#D4AF37]' : 'text-white/25'} />
              <div className="flex-1">
                <div className={'text-sm font-medium ' + (includeInAi ? 'text-[#D4AF37]' : 'text-white/40')}>Include in AI Insights</div>
                <div className="text-xs text-white/30 mt-0.5">AI will reference this when generating insights and protocols</div>
              </div>
              <div className={'w-9 h-5 rounded-full transition-all flex items-center px-0.5 ' + (includeInAi ? 'bg-[#D4AF37] justify-end' : 'bg-white/10 justify-start')}>
                <div className="w-4 h-4 rounded-full bg-white shadow" />
              </div>
            </div>
            <button onClick={handleUpload} disabled={uploading || !selectedFile} className="forge-btn-gold w-full flex items-center justify-center gap-2 py-3 disabled:opacity-50">
              {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</> : <><Upload size={16} /> Upload Document</>}
            </button>
          </div>
        )}

        {/* AI context banner */}
        {aiDocs.length > 0 && (
          <div className="bg-[#D4AF37]/6 border border-[#D4AF37]/15 rounded-2xl p-4 flex items-start gap-3">
            <Brain size={16} className="text-[#D4AF37] mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-[#D4AF37] font-medium">{aiDocs.length} document{aiDocs.length !== 1 ? 's' : ''} included in AI context</p>
              <p className="text-xs text-white/35 mt-0.5">Referenced when generating insights and protocols for {clientName}</p>
            </div>
          </div>
        )}

        <ClientDocumentInsightPanel clientId={clientId} aiDocCount={aiDocs.length} />

        {/* Document list */}
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-white/20" /></div>
        ) : docs.length === 0 ? (
          <div className="bg-[#111111] border border-dashed border-white/8 rounded-2xl p-12 text-center">
            <FileText size={32} className="mx-auto mb-4 text-white/15" />
            <p className="text-sm text-white/40">No documents uploaded yet</p>
            <p className="text-xs text-white/25 mt-1">Upload lab reports, assessments, questionnaires, protocols and more</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(doc => (
              <div key={doc.id} className="bg-[#111111] border border-white/6 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white/6 flex items-center justify-center flex-shrink-0"><File size={15} className="text-white/40" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white truncate">{doc.title ?? doc.file_name}</span>
                      <span className={'text-[10px] px-2 py-0.5 rounded-full border font-mono uppercase tracking-wide ' + (DOC_TYPE_COLORS[doc.document_type] ?? DOC_TYPE_COLORS.general)}>
                        {DOC_TYPES.find(t => t.value === doc.document_type)?.label ?? doc.document_type}
                      </span>
                      {doc.include_in_ai && <span className="flex items-center gap-1 text-[10px] text-[#D4AF37]/60"><Brain size={10} /> AI</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-white/30">
                      <span>{doc.file_name}</span>
                      <span>{formatSize(doc.file_size)}</span>
                      <span>{formatDate(doc.created_at)}</span>
                    </div>
                    {doc.notes && <p className="text-xs text-white/35 mt-1">{doc.notes}</p>}
                  </div>
                  <button onClick={() => handleView(doc)} title="View document" className="text-white/15 hover:text-blue-400 transition-colors flex-shrink-0 p-1"><Eye size={14} /></button>
                  <button onClick={() => handleDelete(doc.id, doc.file_name)} className="text-white/15 hover:text-red-400 transition-colors flex-shrink-0 p-1"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
