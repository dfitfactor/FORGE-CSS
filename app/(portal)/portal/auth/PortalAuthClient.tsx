'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function PortalAuthClient() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [loading, setLoading] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const searchParams = useSearchParams()
  const errorParam = searchParams.get('error')

  const errorMessages: Record<string, string> = {
    invalid: 'This login link is invalid.',
    used: 'This login link has already been used. Request a new one.',
    expired: 'This login link has expired. Request a new one.',
    server: 'Something went wrong. Please try again.',
  }

  async function handleMagicLink() {
    if (!email) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/portal/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (res.ok) {
        setSent(true)
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Failed to send link')
      }
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  async function handleDirectSignIn() {
    if (!email || !dateOfBirth) {
      setError('Enter your email and date of birth to sign in.')
      return
    }

    setSigningIn(true)
    setError('')
    try {
      const res = await fetch('/api/portal/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, dateOfBirth }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to sign in')
      }
      router.push('/portal/dashboard')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to sign in')
    } finally {
      setSigningIn(false)
    }
  }

  return (
    <div style={{ maxWidth: '400px', margin: '60px auto', padding: '0 16px' }}>
      <div
        style={{
          backgroundColor: 'var(--app-surface)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          padding: '40px',
        }}
      >
        <h1 style={{ color: 'var(--app-gold)', fontSize: '24px', marginBottom: '8px', fontWeight: 'bold' }}>
          Client Portal
        </h1>
        <p style={{ color: 'var(--app-text-muted)', fontSize: '14px', marginBottom: '32px' }}>
          Sign in with your email and date of birth, or request a magic link.
        </p>

        {errorParam && errorMessages[errorParam] && (
          <div
            style={{
              backgroundColor: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '20px',
              color: '#f87171',
              fontSize: '14px',
            }}
          >
            {errorMessages[errorParam]}
          </div>
        )}

        {sent ? (
          <div
            style={{
              backgroundColor: 'var(--app-gold-soft)',
              border: '1px solid rgba(212,175,55,0.3)',
              borderRadius: '8px',
              padding: '20px',
              textAlign: 'center',
            }}
          >
            <p style={{ color: 'var(--app-gold)', fontWeight: 'bold', marginBottom: '8px' }}>Check your email</p>
            <p style={{ color: 'var(--app-text-secondary)', fontSize: '14px' }}>
              We sent a login link to {email}. It expires in 30 minutes.
            </p>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <label
                style={{
                  display: 'block',
                  color: 'var(--app-text-secondary)',
                  fontSize: '12px',
                  marginBottom: '8px',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                }}
              >
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                style={{
                  width: '100%',
                  backgroundColor: 'var(--app-surface-muted)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  color: 'var(--app-text)',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label
                style={{
                  display: 'block',
                  color: 'var(--app-text-secondary)',
                  fontSize: '12px',
                  marginBottom: '8px',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                }}
              >
                Date of Birth
              </label>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: 'var(--app-surface-muted)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  color: 'var(--app-text)',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {error && (
              <p style={{ color: '#f87171', fontSize: '13px', marginBottom: '16px' }}>{error}</p>
            )}

            <button
              type="button"
              onClick={handleDirectSignIn}
              disabled={signingIn}
              style={{
                width: '100%',
                backgroundColor: 'var(--app-gold)',
                color: '#000000',
                border: 'none',
                borderRadius: '8px',
                padding: '14px',
                fontSize: '15px',
                fontWeight: 'bold',
                cursor: signingIn ? 'not-allowed' : 'pointer',
                opacity: signingIn ? 0.7 : 1,
                marginBottom: '12px',
              }}
            >
              {signingIn ? 'Signing In...' : 'Sign In'}
            </button>

            <button
              type="button"
              onClick={handleMagicLink}
              disabled={loading}
              style={{
                width: '100%',
                backgroundColor: 'transparent',
                color: 'var(--app-gold)',
                border: '1px solid rgba(212,175,55,0.35)',
                borderRadius: '8px',
                padding: '14px',
                fontSize: '15px',
                fontWeight: 'bold',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Sending...' : 'Email Me a Magic Link'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
