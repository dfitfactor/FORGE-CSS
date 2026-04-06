import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import PortalFormSubmissionView from '@/components/modules/portal/PortalFormSubmissionView'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { buildPortalSubmissionDocument } from '@/lib/portal-form-render'

async function getCoachSubmission(clientId: string, submissionId: string, sessionId: string, role: string) {
  const client = await db.queryOne<{ id: string; full_name: string; coach_id?: string | null }>(
    `SELECT id, full_name, coach_id FROM clients WHERE id = $1`,
    [clientId]
  ).catch(() => null)

  if (!client) return null
  if (typeof client.coach_id === 'string' && client.coach_id !== sessionId && role !== 'admin') {
    return null
  }

  const submission = await db.queryOne<{
    id: string
    slug: string
    name: string
    submitted_at: string | null
    signature_data: string | null
    responses: Record<string, unknown> | string | null
  }>(
    `SELECT fs.id,
            ft.slug,
            ft.name,
            fs.submitted_at::text AS submitted_at,
            fs.signature_data,
            fs.responses
     FROM form_submissions fs
     JOIN form_templates ft ON ft.id = fs.form_template_id
     WHERE fs.id = $1
       AND fs.client_id = $2
       AND fs.status = 'submitted'
     LIMIT 1`,
    [submissionId, clientId]
  ).catch(() => null)

  if (!submission) return null
  return { client, submission }
}

export default async function ClientFormSubmissionPage({
  params,
}: {
  params: { clientId: string; submissionId: string }
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const data = await getCoachSubmission(params.clientId, params.submissionId, session.id, session.role)
  if (!data) notFound()

  const responses = typeof data.submission.responses === 'string'
    ? JSON.parse(data.submission.responses)
    : data.submission.responses || {}

  const submissionDocument = buildPortalSubmissionDocument({
    id: data.submission.id,
    slug: data.submission.slug,
    name: data.submission.name,
    submitted_at: data.submission.submitted_at,
    signature_data: data.submission.signature_data,
    responses,
    completed_by: data.client.full_name,
  })

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6 md:p-8">
      <div className="max-w-5xl mx-auto">
        <Link href={`/clients/${data.client.id}/forms`} className="text-sm text-white/45 hover:text-white transition-colors inline-block mb-4">
          Back to completed forms
        </Link>
        <PortalFormSubmissionView submissionDocument={submissionDocument} />
      </div>
    </div>
  )
}
