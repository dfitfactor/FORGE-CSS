import Link from 'next/link'
import type { ReactNode } from 'react'
import { getBrandLogoUrl } from '@/lib/branding'

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const logoUrl = await getBrandLogoUrl()

  return (
    <div className="min-h-screen bg-[#f7f5ef] text-[#1b140d]">
      <header className="border-b border-black/10 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/book" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#2B154A]">
              <img src={logoUrl} alt="FORGE" className="h-6 w-6 object-contain" />
            </div>
            <div>
              <div className="font-semibold tracking-wide text-[#1b140d]">FORGE</div>
              <div className="text-xs uppercase tracking-[0.2em] text-black/45">Booking</div>
            </div>
          </Link>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
