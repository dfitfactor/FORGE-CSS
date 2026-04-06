import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, FileText } from 'lucide-react'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

type ClientFormRow = {
  id: string
  slug: string
  name: string
  submitted_at: string | null
  signature_data: string | null
}

async function getClientAndForms(clientId: string, sessionId: string, role: string) {
  const client = await db.queryOne<{ id: string; full_name: string; coach_id?: string | null }>(
    `SELECT id, full_name, coach_id FROM clients WHERE id = $1`,
    [clientId]
  ).catch(() => null)

  if (!client) return null
  if (typeof client.coach_id === 'string' && client.coach_id !== sessionId && role !== 'admin') {
    return null
  }

  const submissions = await db.query<ClientFormRow>(
    `SELECT fs.id,
            ft.slug,
            ft.name,
            fs.submitted_at::text AS submitted_at,
            fs.signature_data
     FROM form_submissions fs
     JOIN form_templates ft ON ft.id = fs.form_template_id
     WHERE fs.client_id = $1
       AND fs.status = 'submitted'
     ORDER BY fs.submitted_at DESC NULLS LAST, fs.created_at DESC NULLS LAST`,
    [clientId]
  ).catch(() => [])

  return { client, submissions }
}

export default async function ClientFormsPage({ params }: { params: { clientId: string } }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const data = await getClientAndForms(params.clientId, session.id, session.role)
  if (!data) notFound()

  const { client, submissions } = data

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href={`/clients/${client.id}`} className="w-9 h-9 rounded-lg bg-white/6 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors">
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-white">Completed Forms</h1>
            <p className="text-sm text-white/40">{client.full_name}</p>
          </div>
        </div>

        <div className="bg-[#111111] border border-white/6 rounded-2xl p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-[#D4AF37] font-semibold mb-4">Client Form Archive</div>
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
                  <Link href={`/clients/${client.id}/forms/${submission.id}`} className="forge-btn-secondary text-sm whitespace-nowrap">
                    Open PDF View
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
