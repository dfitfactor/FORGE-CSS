import { getSession } from '@/lib/auth'
import { DashboardFrame } from '@/components/ui/DashboardFrame'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session) {
    redirect('/auth/login')
  }

  return <DashboardFrame>{children}</DashboardFrame>
}