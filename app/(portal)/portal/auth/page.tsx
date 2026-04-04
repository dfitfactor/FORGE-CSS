import { Suspense } from 'react'
import PortalAuthClient from './PortalAuthClient'

export default function PortalAuthPage() {
  return (
    <Suspense fallback={null}>
      <PortalAuthClient />
    </Suspense>
  )
}
