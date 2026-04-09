import { getSession } from '@/lib/auth'
import { Sidebar } from '@/components/ui/Sidebar'
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

  return (
    <div className="flex min-h-screen bg-forge-surface">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        {children}
      </main>
    </div>
  )
}