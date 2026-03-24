'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (res.ok) {
        window.location.href = '/dashboard'
        return
      }
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Login failed (' + res.status + ')')
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
          <p className="text-forge-text-muted text-sm">Behavioral Intelligence Platform - Coach Portal</p>
        </div>
        <div className="forge-card">
          <h2 className="text-lg font-semibold text-forge-text-primary mb-6">Sign In</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="forge-label">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="forge-input"
                placeholder="coach@dfitfactor.com"
                required
                autoFocus
                disabled={loading}
              />
            </div>
            <div>
              <label className="forge-label">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="forge-input pr-11"
                  placeholder="********"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-forge-text-muted"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {error ? (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div>
            ) : null}
            <button
              type="submit"
              disabled={loading}
              className="forge-btn-gold w-full mt-2 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Signing in...
                </>
              ) : (
                'Sign In to FORGE'
              )}
            </button>
          </form>
          <div className="mt-4 space-y-2 text-center text-sm">
            <p className="text-forge-text-muted">
              Need an account?{' '}
              <Link href="/signup" className="text-forge-gold hover:text-forge-text-primary">
                Create account
              </Link>
            </p>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-forge-text-muted">2026 FORGE. All rights reserved.</p>
      </div>
    </div>
  )
}
