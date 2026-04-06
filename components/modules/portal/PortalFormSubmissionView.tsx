'use client'

import { useEffect, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import type { PortalSubmissionDocument } from '@/lib/portal-form-render'

type Props = {
  submissionDocument: PortalSubmissionDocument
}

const APP_SHELL_STYLE: React.CSSProperties = {
  maxWidth: '960px',
  margin: '0 auto',
  color: '#111827',
}

const ACTION_BUTTON_STYLE: React.CSSProperties = {
  borderRadius: '10px',
  padding: '11px 16px',
  fontSize: '13px',
  fontWeight: 700,
  cursor: 'pointer',
}

const PRINT_SURFACE_STYLE: React.CSSProperties = {
  width: '816px',
  backgroundColor: '#ffffff',
  color: '#000000',
  fontFamily: 'Arial, sans-serif',
  padding: '60px',
  boxSizing: 'border-box',
}

function formatSubmittedDate(value: string | null | undefined) {
  if (!value) return 'Unavailable'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return 'Unavailable'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })
}

function PrintableDocument({
  submissionDocument,
}: {
  submissionDocument: PortalSubmissionDocument
}) {
  const formattedDate = formatSubmittedDate(submissionDocument.submittedAt)
  const formattedTimestamp = formatTimestamp(submissionDocument.submittedAt)

  return (
    <div style={PRINT_SURFACE_STYLE}>
      <div style={{ borderBottom: '3px solid #1a0a2e', paddingBottom: '20px', marginBottom: '30px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '24px' }}>
          <div>
            <h1 style={{ color: '#1a0a2e', fontSize: '28px', margin: 0, fontWeight: 'bold' }}>
              DFitFactor®
            </h1>
            <p style={{ color: '#666666', fontSize: '12px', margin: '2px 0 0' }}>
              Strength Forged In Training
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ color: '#666666', fontSize: '11px', margin: 0 }}>
              Document ID: {submissionDocument.id}
            </p>
            <p style={{ color: '#666666', fontSize: '11px', margin: 0 }}>
              {formattedDate}
            </p>
          </div>
        </div>
      </div>

      <h2 style={{ color: '#000000', fontSize: '26px', marginBottom: '4px', marginTop: 0 }}>
        {submissionDocument.title}
      </h2>
      <p style={{ color: '#666666', fontSize: '13px', marginBottom: '30px', marginTop: 0 }}>
        Completed by {submissionDocument.completedBy || 'Client'} on {formattedDate}
      </p>

      {submissionDocument.sections.map((section) => (
        <div key={section.title} style={{ marginBottom: '24px', breakInside: 'avoid' }}>
          <div style={{ borderLeft: '3px solid #D4AF37', paddingLeft: '12px', marginBottom: '12px' }}>
            <h3 style={{ color: '#1a0a2e', fontSize: '13px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>
              {section.title}
            </h3>
          </div>
          <div style={{ backgroundColor: '#f9f9f9', padding: '16px', borderRadius: '4px' }}>
            {section.fields.map((field, index) => (
              <div
                key={`${section.title}-${field.label}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '200px 1fr',
                  gap: '8px',
                  marginBottom: index === section.fields.length - 1 ? 0 : '10px',
                  paddingBottom: index === section.fields.length - 1 ? 0 : '10px',
                  borderBottom: index === section.fields.length - 1 ? 'none' : '1px solid #eeeeee',
                }}
              >
                <span style={{ color: '#666666', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', paddingTop: '2px' }}>
                  {field.label}
                </span>
                <span style={{ color: '#000000', fontSize: '13px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {field.value || '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style={{ marginTop: '30px', borderTop: '2px solid #1a0a2e', paddingTop: '20px' }}>
        <p style={{ color: '#1a0a2e', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', marginTop: 0 }}>
          Signature
        </p>
        <p style={{ fontSize: '20px', fontStyle: 'italic', color: '#000000', marginBottom: '4px', marginTop: 0 }}>
          {submissionDocument.signature || 'No signature provided'}
        </p>
        <p style={{ color: '#666666', fontSize: '12px', margin: 0 }}>
          {submissionDocument.completedBy || 'Client'} — {formattedDate}
        </p>
        <p style={{ color: '#999999', fontSize: '10px', marginTop: '8px', marginBottom: 0, lineHeight: 1.6 }}>
          Electronically signed via DFitFactor Client Portal. Document ID: {submissionDocument.id}. Submitted: {formattedTimestamp}
        </p>
      </div>

      <div style={{ marginTop: '40px', borderTop: '1px solid #cccccc', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px' }}>
        <div>
          <p style={{ color: '#333333', fontSize: '11px', fontWeight: 'bold', margin: 0 }}>
            Coach Dee Byfield, MBA, CHC, CSNC, CPT
          </p>
          <p style={{ color: '#666666', fontSize: '10px', margin: 0 }}>
            DFitfactor
          </p>
        </div>
        <p style={{ color: '#999999', fontSize: '10px', margin: 0 }}>
          Strength Forged In Training
        </p>
      </div>
    </div>
  )
}

export default function PortalFormSubmissionView({ submissionDocument }: Props) {
  const pdfContentRef = useRef<HTMLDivElement | null>(null)
  const [busyAction, setBusyAction] = useState<'preview' | 'download' | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  async function buildPdfBlob() {
    if (!pdfContentRef.current) return null

    const canvas = await html2canvas(pdfContentRef.current, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      windowWidth: 1200,
    })

    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 10
    const usableWidth = pageWidth - margin * 2
    const pageCanvas = document.createElement('canvas')
    const pageCtx = pageCanvas.getContext('2d')
    const pxPerMm = canvas.width / usableWidth
    const pageHeightPx = Math.floor((pageHeight - margin * 2) * pxPerMm)
    const footerY = pageHeight - 6
    let offsetY = 0
    let pageIndex = 0

    while (offsetY < canvas.height) {
      pageCanvas.width = canvas.width
      pageCanvas.height = Math.min(pageHeightPx, canvas.height - offsetY)

      if (!pageCtx) break
      pageCtx.clearRect(0, 0, pageCanvas.width, pageCanvas.height)
      pageCtx.drawImage(
        canvas,
        0,
        offsetY,
        canvas.width,
        pageCanvas.height,
        0,
        0,
        pageCanvas.width,
        pageCanvas.height
      )

      const imgData = pageCanvas.toDataURL('image/png')
      const renderedHeight = pageCanvas.height / pxPerMm
      if (pageIndex > 0) pdf.addPage()
      pdf.addImage(imgData, 'PNG', margin, margin, usableWidth, renderedHeight)
      pdf.setFontSize(9)
      pdf.setTextColor(120, 120, 120)
      pdf.text(`Page ${pageIndex + 1}`, pageWidth - margin, footerY, { align: 'right' })
      pdf.text(formatSubmittedDate(submissionDocument.submittedAt), margin, footerY)
      offsetY += pageCanvas.height
      pageIndex += 1
    }

    return pdf.output('blob')
  }

  async function handlePreview() {
    setBusyAction('preview')
    try {
      const blob = await buildPdfBlob()
      if (!blob) return
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(URL.createObjectURL(blob))
    } finally {
      setBusyAction(null)
    }
  }

  async function handleDownload() {
    setBusyAction('download')
    try {
      const blob = await buildPdfBlob()
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${submissionDocument.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <div style={APP_SHELL_STYLE}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '6px', color: '#ffffff' }}>{submissionDocument.title}</h1>
          <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: 0 }}>{submissionDocument.subtitle}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handlePreview}
            disabled={busyAction !== null}
            style={{ ...ACTION_BUTTON_STYLE, background: 'transparent', color: '#ffffff', border: '1px solid rgba(255,255,255,0.14)', opacity: busyAction && busyAction !== 'preview' ? 0.65 : 1 }}
          >
            {busyAction === 'preview' ? 'Preparing preview...' : 'Preview PDF'}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={busyAction !== null}
            style={{ ...ACTION_BUTTON_STYLE, background: '#D4AF37', color: '#000000', border: 'none', opacity: busyAction && busyAction !== 'download' ? 0.65 : 1 }}
          >
            {busyAction === 'download' ? 'Preparing PDF...' : 'Download PDF'}
          </button>
        </div>
      </div>

      <div style={{ background: '#ffffff', borderRadius: '18px', overflow: 'hidden', boxShadow: '0 18px 50px rgba(0,0,0,0.24)', border: '1px solid rgba(26,10,46,0.08)' }}>
        <PrintableDocument submissionDocument={submissionDocument} />
      </div>

      <div
        style={{
          position: 'fixed',
          left: '-9999px',
          top: 0,
          width: '816px',
          pointerEvents: 'none',
          opacity: 0,
        }}
      >
        <div ref={pdfContentRef}>
          <PrintableDocument submissionDocument={submissionDocument} />
        </div>
      </div>

      {previewUrl ? (
        <div style={{ marginTop: '24px', background: '#ffffff', border: '1px solid rgba(26,10,46,0.08)', borderRadius: '16px', padding: '18px', boxShadow: '0 18px 50px rgba(0,0,0,0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ color: '#1a0a2e', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
              PDF Preview
            </div>
            <button
              type="button"
              onClick={() => {
                URL.revokeObjectURL(previewUrl)
                setPreviewUrl(null)
              }}
              style={{ background: 'transparent', border: '1px solid rgba(26,10,46,0.14)', color: '#1a0a2e', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer' }}
            >
              Close Preview
            </button>
          </div>
          <iframe src={previewUrl} title="Form PDF Preview" style={{ width: '100%', minHeight: '720px', border: '1px solid #e5e7eb', borderRadius: '12px', background: '#ffffff' }} />
        </div>
      ) : null}
    </div>
  )
}
