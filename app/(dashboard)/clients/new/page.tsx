'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, UserPlus, Loader2 } from 'lucide-react'

function RequiredAsterisk() {
  return <span className="ml-1 text-red-400">*</span>
}

export default function NewClientPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    fullName: '', email: '', phone: '',
    dateOfBirth: '', gender: '',
    programTier: 'forge_core', primaryGoal: '',
    currentStage: 'foundations', status: 'active',
  })

  function set(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleCreate() {
    if (!form.fullName.trim()) { setError('Full name is required'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: form.fullName,
          email: form.email || undefined,
          phone: form.phone || undefined,
          dateOfBirth: form.dateOfBirth || undefined,
          gender: form.gender || undefined,
          programTier: form.programTier,
          primaryGoal: form.primaryGoal || undefined,
          currentStage: form.currentStage,
          status: form.status,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? 'Failed to create client')
        return
      }
      const d = await res.json()
      const clientId = d.clientId ?? d.client?.id
      if (!clientId) {
        setError('Client created, but redirect target was missing')
        return
      }
      router.push('/clients/' + clientId)
    } catch {
      setError('Network error - please try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6 md:p-8">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/clients"
            className="w-9 h-9 rounded-lg bg-white/6 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors">
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-white">New Client</h1>
            <p className="text-sm text-white/40">Add a client to your roster</p>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>
        )}

        <div className="bg-[#111111] border border-white/8 rounded-2xl p-6 space-y-4">
          <h2 className="text-xs font-semibold text-white uppercase tracking-widest font-mono">Identity</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="forge-label">Full Name<RequiredAsterisk /></label>
              <input value={form.fullName} onChange={e => set('fullName', e.target.value)}
                className="forge-input" placeholder="Client full name" />
            </div>
            <div>
              <label className="forge-label">Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                className="forge-input" placeholder="email@example.com" />
            </div>
            <div>
              <label className="forge-label">Phone</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)}
                className="forge-input" placeholder="+1 (555) 000-0000" />
            </div>
            <div>
              <label className="forge-label">Date of Birth</label>
              <input type="date" value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)}
                className="forge-input" />
            </div>
            <div>
              <label className="forge-label">Gender</label>
              <select value={form.gender} onChange={e => set('gender', e.target.value)} className="forge-input">
                <option value="">Select gender...</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="non-binary">Non-binary</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-[#111111] border border-white/8 rounded-2xl p-6 space-y-4">
          <h2 className="text-xs font-semibold text-white uppercase tracking-widest font-mono">Program</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="forge-label">Program Tier</label>
              <select value={form.programTier} onChange={e => set('programTier', e.target.value)} className="forge-input">
                <option value="forge_lite">Forge Lite</option>
                <option value="forge_core">Forge Core</option>
                <option value="forge_elite">Forge Elite</option>
              </select>
            </div>
            <div>
              <label className="forge-label">Starting Stage</label>
              <select value={form.currentStage} onChange={e => set('currentStage', e.target.value)} className="forge-input">
                <option value="foundations">Foundation</option>
                <option value="optimization">Optimization</option>
                <option value="resilience">Resilience</option>
                <option value="growth">Growth</option>
                <option value="empowerment">Empowerment</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="forge-label">Primary Goal</label>
              <textarea rows={3} value={form.primaryGoal} onChange={e => set('primaryGoal', e.target.value)}
                className="forge-input resize-none" placeholder="What does success look like for this client?" />
            </div>
          </div>
        </div>

        <button onClick={handleCreate} disabled={saving}
          className="forge-btn-gold w-full flex items-center justify-center gap-2 py-3 text-base font-semibold disabled:opacity-60">
          {saving
            ? <><Loader2 className="w-5 h-5 animate-spin" /> Creating...</>
            : <><UserPlus className="w-5 h-5" /> Create Client</>
          }
        </button>
      </div>
    </div>
  )
}
