import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'FORGË CSS — Client Support System',
  description: 'FORGË Behavioral Intelligence Platform — Client Support System',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-forge-surface text-forge-text-primary antialiased`}>
        {children}
      </body>
    </html>
  )
}
