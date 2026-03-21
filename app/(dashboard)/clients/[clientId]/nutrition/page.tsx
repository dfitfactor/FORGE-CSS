import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { loadNutritionWorkspace } from '@/lib/protocol-workspaces'
import NutritionProtocolWorkspace from '@/components/modules/clients/NutritionProtocolWorkspace'

export default async function NutritionPage({ params }: { params: { clientId: string } }) {
  const session = await getSession()
  if (!session) return null

  const client = await db.queryOne<{ id: string; full_name: string; coach_id: string }>(
    `SELECT id, full_name, coach_id
     FROM clients
     WHERE id = $1`,
    [params.clientId]
  )

  if (!client || (client.coach_id !== session.id && session.role !== 'admin')) {
    return notFound()
  }

  const workspace = await loadNutritionWorkspace(params.clientId)

  return (
    <NutritionProtocolWorkspace
      clientId={params.clientId}
      clientName={client.full_name}
      initialData={workspace}
    />
  )
}
