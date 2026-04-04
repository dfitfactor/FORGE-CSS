'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'

export default function PortalAuthClient() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/portal/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      if (res.ok) {
        setSent(true)
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to send link')
      }
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      maxWidth: '400px',
      margin: '60px auto',
      padding: '0 16px'
    }}>
      <div style={{
        backgroundColor: '#111111',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '16px',
        padding: '40px'
      }}>
        <h1 style={{
          color: '#D4AF37',
          fontSize: '24px',
          marginBottom: '8px',
          fontWeight: 'bold'
        }}>
          Client Portal
        </h1>
        <p style={{ color: '#666', fontSize: '14px', marginBottom: '32px' }}>
          Enter your email to receive a login link
        </p>

        {errorParam && errorMessages[errorParam] && (
          <div style={{
            backgroundColor: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '20px',
            color: '#f87171',
            fontSize: '14px'
          }}>
            {errorMessages[errorParam]}
          </div>
        )}

        {sent ? (
          <div style={{
            backgroundColor: 'rgba(212,175,55,0.1)',
            border: '1px solid rgba(212,175,55,0.3)',
            borderRadius: '8px',
            padding: '20px',
            textAlign: 'center'
          }}>
            <p style={{ color: '#D4AF37', fontWeight: 'bold', marginBottom: '8px' }}>
              Check your email
            </p>
            <p style={{ color: '#888', fontSize: '14px' }}>
              We sent a login link to {email}.
              It expires in 30 minutes.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                color: '#888',
                fontSize: '12px',
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '1px'
              }}>
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                style={{
                  width: '100%',
                  backgroundColor: '#1a1a1a',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  color: '#ffffff',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {error && (
              <p style={{
                color: '#f87171',
                fontSize: '13px',
                marginBottom: '16px'
              }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                backgroundColor: '#D4AF37',
                color: '#000000',
                border: 'none',
                borderRadius: '8px',
                padding: '14px',
                fontSize: '15px',
                fontWeight: 'bold',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? 'Sending...' : 'Send Login Link →'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
