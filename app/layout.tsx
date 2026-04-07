import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'FORGË CSS — Client Support System',
  description: 'FORGË Behavioral Intelligence Platform — Client Support System',
}

const themeScript = `
(function () {
  try {
    var stored = window.localStorage.getItem('forge-theme')
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    document.documentElement.setAttribute('data-theme', theme)
  } catch (error) {
    document.documentElement.setAttribute('data-theme', 'dark')
  }
})();
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} bg-forge-surface text-forge-text-primary antialiased`}>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  )
}