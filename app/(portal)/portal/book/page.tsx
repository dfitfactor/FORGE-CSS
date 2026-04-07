import { getPortalClientOrRedirect } from '@/lib/client-portal'
import { db } from '@/lib/db'
import { getClientBankStatus } from '@/lib/session-bank'
import PortalBookClient from '@/components/modules/portal/PortalBookClient'

export default async function PortalBookPage() {
  const { client } = await getPortalClientOrRedirect()
  const enrollment = await db.queryOne<{ id: string }>(
    `SELECT id
     FROM package_enrollments
     WHERE client_id = $1
       AND status = 'active'
     ORDER BY created_at DESC
     LIMIT 1`,
    [client.id]
  )

  const bank = enrollment?.id ? await getClientBankStatus(enrollment.id).catch(() => null) : null

  return <PortalBookClient initialBank={bank} />
}

