import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { LeadDetailPanel } from '@/components/modules/leads/LeadDetailPanel'

export default function LeadDetailPage({ params }: { params: { leadId: string } }) {
  return (
    <div className="min-h-screen bg-forge-surface p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/leads" className="inline-flex items-center gap-2 text-sm text-forge-text-muted transition-colors hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Back to Leads
          </Link>
        </div>

        <LeadDetailPanel leadId={params.leadId} />
      </div>
    </div>
  )
}
