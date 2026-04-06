'use client'

import { useEffect, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import type { PortalSubmissionDocument } from '@/lib/portal-form-render'

type Props = {
  submissionDocument: PortalSubmissionDocument
}

const cardStyle: React.CSSProperties = {
  background: '#111111',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '16px',
  padding: '24px',
}

export default function PortalFormSubmissionView({ submissionDocument }: Props) {
  const contentRef = useRef<HTMLDivElement | null>(null)
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
    if (!contentRef.current) return null

    const canvas = await html2canvas(contentRef.current, {
      scale: 2,
      backgroundColor: '#0a0a0a',
      useCORS: true,
      logging: false,
      windowWidth: 1200,
    })

    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 10
    const usableWidth = pageWidth - margin * 2
    const scaledHeight = (canvas.height * usableWidth) / canvas.width
    const pageCanvas = document.createElement('canvas')
    const pageCtx = pageCanvas.getContext('2d')
    const pxPerMm = canvas.width / usableWidth
    const pageHeightPx = Math.floor((pageHeight - margin * 2) * pxPerMm)
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
    <div style={{ maxWidth: '860px', margin: '0 auto', color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '6px' }}>{submissionDocument.title}</h1>
          <p style={{ color: '#777', fontSize: '14px', marginBottom: 0 }}>{submissionDocument.subtitle}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handlePreview}
            disabled={busyAction !== null}
            style={{ background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.14)', borderRadius: '10px', padding: '11px 16px', fontSize: '13px', fontWeight: 700, cursor: busyAction ? 'not-allowed' : 'pointer', opacity: busyAction && busyAction !== 'preview' ? 0.65 : 1 }}
          >
            {busyAction === 'preview' ? 'Preparing preview...' : 'Preview PDF'}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={busyAction !== null}
            style={{ background: '#D4AF37', color: '#000', border: 'none', borderRadius: '10px', padding: '11px 16px', fontSize: '13px', fontWeight: 700, cursor: busyAction ? 'not-allowed' : 'pointer', opacity: busyAction && busyAction !== 'download' ? 0.65 : 1 }}
          >
            {busyAction === 'download' ? 'Preparing PDF...' : 'Download PDF'}
          </button>
        </div>
      </div>

      <div ref={contentRef} style={{ background: '#0a0a0a', padding: '0 0 24px' }}>
        <div style={{ ...cardStyle, marginBottom: '16px' }}>
          <div style={{ color: '#D4AF37', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>
            Completed Form
          </div>
          <div style={{ color: '#fff', fontSize: '24px', fontWeight: 700, marginBottom: '6px' }}>{submissionDocument.title}</div>
          <div style={{ color: '#777', fontSize: '14px' }}>{submissionDocument.subtitle}</div>
        </div>

        {submissionDocument.sections.map((section) => (
          <section key={section.title} style={{ ...cardStyle, marginBottom: '16px' }}>
            <div style={{ color: '#D4AF37', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>
              {section.title}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px 18px' }}>
              {section.fields.map((field) => (
                <div key={`${section.title}-${field.label}`}>
                  <div style={{ color: '#888', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>
                    {field.label}
                  </div>
                  <div style={{ color: '#fff', fontSize: '14px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{field.value}</div>
                </div>
              ))}
            </div>
          </section>
        ))}

        {submissionDocument.signature ? (
          <section style={cardStyle}>
            <div style={{ color: '#D4AF37', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
              Signature
            </div>
            <div style={{ color: '#fff', fontSize: '20px', fontStyle: 'italic' }}>{submissionDocument.signature}</div>
          </section>
        ) : null}
      </div>

      {previewUrl ? (
        <div style={{ marginTop: '24px', ...cardStyle }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ color: '#D4AF37', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
              PDF Preview
            </div>
            <button
              type="button"
              onClick={() => {
                URL.revokeObjectURL(previewUrl)
                setPreviewUrl(null)
              }}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer' }}
            >
              Close Preview
            </button>
          </div>
          <iframe src={previewUrl} title="Form PDF Preview" style={{ width: '100%', minHeight: '720px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', background: '#fff' }} />
        </div>
      ) : null}
    </div>
  )
}
