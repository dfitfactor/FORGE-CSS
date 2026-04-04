import { getPortalBookings, getPortalClientOrRedirect } from '@/lib/client-portal'
import PortalBookingsClient from './PortalBookingsClient'

export default async function PortalBookingsPage() {
  const { client } = await getPortalClientOrRedirect()
  const bookings = await getPortalBookings(client)

  return <PortalBookingsClient initialBookings={bookings} />
}
