'use client'

import { useEffect, useState } from 'react'
import { Loader2, Save } from 'lucide-react'

type AccountState = {
  full_name: string
  email: string
  avatar_url: string
  role: string
  current_password: string
  new_password: string
}

const INITIAL_STATE: AccountState = {
  full_name: '',
  email: '',
  avatar_url: '',
  role: '',
  current_password: '',
  new_password: '',
}

export default function SettingsPage() {
  const [form, setForm] = useState<AccountState>(INITIAL_STATE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    async function loadAccount() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch('/api/auth/account', { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Failed to load account')
        setForm({
          full_name: data.user?.full_name ?? '',
          email: data.user?.email ?? '',
          avatar_url: data.user?.avatar_url ?? '',
          role: data.user?.role ?? '',
          current_password: '',
          new_password: '',
        })
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load account')
      } finally {
        setLoading(false)
      }
    }

    void loadAccount()
  }, [])

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch('/api/auth/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to save settings')
      setSuccess('Settings saved successfully')
      setForm((current) => ({ ...current, current_password: '', new_password: '' }))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Settings</h1>
          <p className="mt-1 text-sm text-white/40">
            Manage your platform login, coach profile, and account preferences.
          </p>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-white/8 bg-[#111111] p-10 text-center text-white/45">
            <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />
            Loading account settings...
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div> : null}
            {success ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">{success}</div> : null}

            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-white/8 bg-[#111111] p-5 space-y-4">
                <div>
                  <p className="text-xs font-mono uppercase tracking-widest text-white/30">Account</p>
                  <h2 className="mt-3 text-sm font-semibold text-white">Login & Profile</h2>
                </div>

                <div>
                  <label className="forge-label">Full Name</label>
                  <input className="forge-input" value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} />
                </div>

                <div>
                  <label className="forge-label">Email</label>
                  <input type="email" className="forge-input" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
                </div>

                <div>
                  <label className="forge-label">Avatar URL</label>
                  <input className="forge-input" value={form.avatar_url} onChange={(event) => setForm((current) => ({ ...current, avatar_url: event.target.value }))} placeholder="https://..." />
                </div>

                <div>
                  <label className="forge-label">Role</label>
                  <input className="forge-input opacity-70" value={form.role} readOnly />
                </div>
              </div>

              <div className="rounded-2xl border border-white/8 bg-[#111111] p-5 space-y-4">
                <div>
                  <p className="text-xs font-mono uppercase tracking-widest text-white/30">Security</p>
                  <h2 className="mt-3 text-sm font-semibold text-white">Change Password</h2>
                  <p className="mt-2 text-sm text-white/55">Leave both password fields empty if you do not want to change your password.</p>
                </div>

                <div>
                  <label className="forge-label">Current Password</label>
                  <input type="password" className="forge-input" value={form.current_password} onChange={(event) => setForm((current) => ({ ...current, current_password: event.target.value }))} />
                </div>

                <div>
                  <label className="forge-label">New Password</label>
                  <input type="password" className="forge-input" value={form.new_password} onChange={(event) => setForm((current) => ({ ...current, new_password: event.target.value }))} minLength={8} />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button type="submit" disabled={saving} className="forge-btn-gold inline-flex items-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
