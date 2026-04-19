import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import ClientCompletedFormsPanel from '@/components/modules/clients/ClientCompletedFormsPanel'
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

        <ClientCompletedFormsPanel clientId={client.id} submissions={submissions} />
      </div>
    </div>
  )
}
