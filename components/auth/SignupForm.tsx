'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

export default function SignupForm() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, email, password }),
      })

      if (res.ok) {
        window.location.href = '/dashboard'
        return
      }

      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Failed to create account')
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-forge-surface flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-forge-purple flex items-center justify-center">
              <img src="/Forge-Logo.png" alt="FORGE" className="w-7 h-7 object-contain" />
            </div>
            <div className="text-left">
              <div className="text-2xl font-bold text-forge-text-primary">FORG<span className="text-forge-gold">E</span></div>
              <div className="text-xs text-forge-text-muted uppercase tracking-widest">Client Support System</div>
            </div>
          </div>
          <p className="text-forge-text-muted text-sm">Create your coach account</p>
        </div>

        <div className="forge-card">
          <h2 className="text-lg font-semibold text-forge-text-primary mb-6">Create Account</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="forge-label">Full Name</label>
              <input type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} className="forge-input" placeholder="Coach Name" required disabled={loading} />
            </div>
            <div>
              <label className="forge-label">Email</label>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="forge-input" placeholder="coach@dfitfactor.com" required disabled={loading} />
            </div>
            <div>
              <label className="forge-label">Password</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} className="forge-input pr-11" placeholder="Minimum 8 characters" minLength={8} required disabled={loading} />
                <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-forge-text-muted">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {error ? <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div> : null}
            <button type="submit" disabled={loading} className="forge-btn-gold w-full mt-2 flex items-center justify-center gap-2">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating account...</> : 'Create Account'}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-forge-text-muted">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-forge-gold hover:text-forge-text-primary">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
