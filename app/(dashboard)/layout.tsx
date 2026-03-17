import { getSession } from '@/lib/auth'
import { Sidebar } from '@/components/ui/Sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {

  // TEMP DEV MODE
  const session = await getSession()
  console.log("DEV SESSION:", session)

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}