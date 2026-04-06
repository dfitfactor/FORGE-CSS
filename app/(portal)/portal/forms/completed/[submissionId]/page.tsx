import Link from 'next/link'
import { notFound } from 'next/navigation'
import PortalFormSubmissionView from '@/components/modules/portal/PortalFormSubmissionView'
import { db } from '@/lib/db'
import { getPortalClientOrRedirect } from '@/lib/client-portal'
import { buildPortalSubmissionDocument } from '@/lib/portal-form-render'

export default async function PortalCompletedFormPage({
  params,
}: {
  params: { submissionId: string }
}) {
  const { client } = await getPortalClientOrRedirect()

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
    [params.submissionId, client.id]
  ).catch(() => null)

  if (!submission) {
    notFound()
  }

  const responses = typeof submission.responses === 'string'
    ? JSON.parse(submission.responses)
    : submission.responses || {}

  const document = buildPortalSubmissionDocument({
    id: submission.id,
    slug: submission.slug,
    name: submission.name,
    submitted_at: submission.submitted_at,
    signature_data: submission.signature_data,
    responses,
    completed_by: client.full_name
  })

  return (
    <div>
      <Link href="/portal/forms" style={{ color: '#888', fontSize: '13px', textDecoration: 'none', display: 'inline-block', marginBottom: '16px' }}>
        Back to forms
      </Link>
      <PortalFormSubmissionView submissionDocument={document} />
    </div>
  )
}
