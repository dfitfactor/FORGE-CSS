'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Loader2, Save, Plus, SquarePen, Trash2, ToggleLeft, ToggleRight, BookTemplate, LogOut, Mail, Upload, X
} from 'lucide-react'
import BusinessHoursCard from '@/components/modules/settings/BusinessHoursCard'
import TeamAccessCard from '@/components/modules/settings/TeamAccessCard'

type AccountState = {
  id: string
  full_name: string
  email: string
  avatar_url: string
  role: string
  timezone: string
  notification_email: string
  current_password: string
  new_password: string
}

type CoachTemplate = {
  id: string
  coach_id: string
  template_type: 'movement' | 'nutrition' | 'habit_coaching'
  name: string
  description: string | null
  template_text: string
  template_payload: Record<string, unknown> | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

type TemplateFormState = {
  template_type: 'movement' | 'nutrition' | 'habit_coaching'
  name: string
  description: string
  template_text: string
  is_active: boolean
  sort_order: string
}

const INITIAL_STATE: AccountState = {
  id: '',
  full_name: '',
  email: '',
  avatar_url: '',
  role: '',
  timezone: 'America/New_York',
  notification_email: 'coach@dfitfactor.com',
  current_password: '',
  new_password: '',
}

const INITIAL_TEMPLATE_FORM: TemplateFormState = {
  template_type: 'movement',
  name: '',
  description: '',
  template_text: '',
  is_active: true,
  sort_order: '0',
}

const TIMEZONE_OPTIONS = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
] as const

const TEMPLATE_TYPES = [
  { value: 'movement', label: 'Movement Templates' },
  { value: 'nutrition', label: 'Nutrition Templates' },
  { value: 'habit_coaching', label: 'Habit Coaching Templates' },
] as const

function formatDateTime(value: string) {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

async function resizeLogoFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file')
  }

  const fileDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Failed to read file'))
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = fileDataUrl
  })

  const maxSize = 512
  const scale = Math.min(maxSize / image.width, maxSize / image.height, 1)
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Failed to process image')
  }

  context.clearRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)

  const output = canvas.toDataURL('image/webp', 0.9)
  if (output.length > 450000) {
    throw new Error('Logo is still too large after compression. Try a smaller image.')
  }

  return output
}
export default function SettingsPage() {
  const router = useRouter()
  const [form, setForm] = useState<AccountState>(INITIAL_STATE)
  const [templates, setTemplates] = useState<CoachTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [templateSaving, setTemplateSaving] = useState(false)
  const [templateDeletingId, setTemplateDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [templateError, setTemplateError] = useState('')
  const [templateSuccess, setTemplateSuccess] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)
  const [portalTestEmail, setPortalTestEmail] = useState('')
  const [portalTestLoading, setPortalTestLoading] = useState(false)
  const [portalTestError, setPortalTestError] = useState('')
  const [portalTestSuccess, setPortalTestSuccess] = useState('')
  const [portalTestLink, setPortalTestLink] = useState('')
  const [activeTemplateType, setActiveTemplateType] = useState<'movement' | 'nutrition' | 'habit_coaching'>('movement')
  const [showTemplateForm, setShowTemplateForm] = useState(false)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [templateForm, setTemplateForm] = useState<TemplateFormState>(INITIAL_TEMPLATE_FORM)
  const [logoUploading, setLogoUploading] = useState(false)

  useEffect(() => {
    async function loadAccount() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch('/api/settings/profile', { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Failed to load account')
        setForm({
          id: data.user?.id ?? '',
          full_name: data.user?.full_name ?? '',
          email: data.user?.email ?? '',
          avatar_url: data.user?.avatar_url ?? '',
          role: data.user?.role ?? '',
          timezone: data.user?.timezone ?? 'America/New_York',
          notification_email: data.user?.notification_email ?? data.user?.email ?? 'coach@dfitfactor.com',
          current_password: '',
          new_password: '',
        })
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load account')
      } finally {
        setLoading(false)
      }
    }

    async function loadTemplates() {
      setTemplatesLoading(true)
      setTemplateError('')
      try {
        const res = await fetch('/api/settings/templates', { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Failed to load templates')
        setTemplates(Array.isArray(data.templates) ? data.templates as CoachTemplate[] : [])
      } catch (err: unknown) {
        setTemplateError(err instanceof Error ? err.message : 'Failed to load templates')
      } finally {
        setTemplatesLoading(false)
      }
    }

    void loadAccount()
    void loadTemplates()
  }, [])

  const filteredTemplates = useMemo(
    () => templates.filter((template) => template.template_type === activeTemplateType),
    [templates, activeTemplateType]
  )

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const profileRes = await fetch('/api/settings/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: form.full_name,
          email: form.email,
          avatar_url: form.avatar_url,
          timezone: form.timezone,
          notification_email: form.notification_email,
        }),
      })
      const profileData = await profileRes.json().catch(() => ({}))
      if (!profileRes.ok) throw new Error(profileData.error ?? 'Failed to save settings')

      if (form.current_password || form.new_password) {
        const passwordRes = await fetch('/api/auth/account', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            full_name: form.full_name,
            email: form.email,
            avatar_url: form.avatar_url,
            current_password: form.current_password,
            new_password: form.new_password,
          }),
        })
        const passwordData = await passwordRes.json().catch(() => ({}))
        if (!passwordRes.ok) throw new Error(passwordData.error ?? 'Failed to update password')
      }

      setSuccess('Settings saved successfully')
      window.dispatchEvent(new CustomEvent('forge-branding-change', { detail: { logoUrl: profileData.user?.avatar_url ?? form.avatar_url ?? '' } }))
      setForm((current) => ({ ...current, current_password: '', new_password: '' }))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      window.location.href = '/auth/login'
      router.refresh()
    }
  }


  async function handleLogoFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setLogoUploading(true)
    setError('')

    try {
      const nextLogo = await resizeLogoFile(file)
      setForm((current) => ({ ...current, avatar_url: nextLogo }))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to process logo')
    } finally {
      setLogoUploading(false)
      event.target.value = ''
    }
  }
  async function handlePortalTest(event: React.FormEvent) {
    event.preventDefault()
    if (!portalTestEmail) return

    setPortalTestLoading(true)
    setPortalTestError('')
    setPortalTestSuccess('')
    setPortalTestLink('')

    try {
      const res = await fetch('/api/portal/auth/test-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: portalTestEmail }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to send portal login link')
      }

      setPortalTestSuccess(data.message ?? 'Portal login link sent.')
      setPortalTestLink(typeof data.magicLink === 'string' ? data.magicLink : '')
    } catch (err: unknown) {
      setPortalTestError(err instanceof Error ? err.message : 'Failed to send portal login link')
    } finally {
      setPortalTestLoading(false)
    }
  }

  function openCreateTemplate(type: 'movement' | 'nutrition' | 'habit_coaching') {
    setEditingTemplateId(null)
    setTemplateForm({ ...INITIAL_TEMPLATE_FORM, template_type: type })
    setShowTemplateForm(true)
    setTemplateError('')
    setTemplateSuccess('')
  }

  function openEditTemplate(template: CoachTemplate) {
    setEditingTemplateId(template.id)
    setTemplateForm({
      template_type: template.template_type,
      name: template.name,
      description: template.description ?? '',
      template_text: template.template_text,
      is_active: template.is_active,
      sort_order: String(template.sort_order ?? 0),
    })
    setShowTemplateForm(true)
    setTemplateError('')
    setTemplateSuccess('')
  }

  async function handleTemplateSave(event: React.FormEvent) {
    event.preventDefault()
    setTemplateSaving(true)
    setTemplateError('')
    setTemplateSuccess('')

    try {
      const res = await fetch(
        editingTemplateId ? `/api/settings/templates/${editingTemplateId}` : '/api/settings/templates',
        {
          method: editingTemplateId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            template_type: templateForm.template_type,
            name: templateForm.name,
            description: templateForm.description || null,
            template_text: templateForm.template_text,
            is_active: templateForm.is_active,
            sort_order: Number(templateForm.sort_order || 0),
          }),
        }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to save template')

      const returnedTemplate = data.template as CoachTemplate | undefined
      if (returnedTemplate) {
        setTemplates((current) => {
          const next = current.filter((template) => template.id !== returnedTemplate.id)
          next.push(returnedTemplate)
          return next.sort((a, b) =>
            a.template_type.localeCompare(b.template_type) ||
            a.sort_order - b.sort_order ||
            b.updated_at.localeCompare(a.updated_at)
          )
        })
      }

      setTemplateSuccess(editingTemplateId ? 'Template updated' : 'Template created')
      setEditingTemplateId(null)
      setTemplateForm({ ...INITIAL_TEMPLATE_FORM, template_type: activeTemplateType })
      setShowTemplateForm(false)
    } catch (err: unknown) {
      setTemplateError(err instanceof Error ? err.message : 'Failed to save template')
    } finally {
      setTemplateSaving(false)
    }
  }

  async function toggleTemplateActive(template: CoachTemplate) {
    setTemplateError('')
    try {
      const res = await fetch(`/api/settings/templates/${template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !template.is_active }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to update template')
      const returnedTemplate = data.template as CoachTemplate | undefined
      if (returnedTemplate) {
        setTemplates((current) => current.map((item) => item.id === returnedTemplate.id ? returnedTemplate : item))
      }
    } catch (err: unknown) {
      setTemplateError(err instanceof Error ? err.message : 'Failed to update template')
    }
  }

  async function deleteTemplate(templateId: string) {
    if (!confirm('Delete this template?')) return
    setTemplateDeletingId(templateId)
    setTemplateError('')
    try {
      const res = await fetch(`/api/settings/templates/${templateId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to delete template')
      setTemplates((current) => current.filter((template) => template.id !== templateId))
    } catch (err: unknown) {
      setTemplateError(err instanceof Error ? err.message : 'Failed to delete template')
    } finally {
      setTemplateDeletingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-forge-surface p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-forge-text-primary">Settings</h1>
          <p className="mt-1 text-sm text-forge-text-muted">
            Manage your account plus reusable nutrition, movement, and habit coaching templates.
          </p>
        </div>
        {loading ? (
          <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-10 text-center text-forge-text-muted">
            <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />
            Loading account settings...
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div> : null}
            {success ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">{success}</div> : null}

            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-5 space-y-4">
                <div>
                  <p className="text-xs font-mono uppercase tracking-widest text-forge-text-muted">Account</p>
                  <h2 className="mt-3 text-sm font-semibold text-forge-text-primary">Login & Profile</h2>
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
                  <label className="forge-label">Brand Logo</label>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 rounded-xl border border-forge-border/70 bg-forge-surface-3/60 p-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-forge-purple">
                        <img src={form.avatar_url || '/forge-logo.png'} alt="Brand logo preview" className="h-9 w-9 object-contain" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-forge-text-primary">Upload your logo</p>
                        <p className="mt-1 text-xs text-forge-text-muted">Used across the dashboard, booking pages, and auth screens.</p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-forge-border bg-forge-surface-3 px-4 py-2 text-sm text-forge-text-primary transition-all hover:bg-forge-surface">
                        {logoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {logoUploading ? 'Processing...' : 'Upload Logo'}
                        <input type="file" accept="image/*" className="hidden" onChange={handleLogoFileChange} />
                      </label>
                      <button
                        type="button"
                        onClick={() => setForm((current) => ({ ...current, avatar_url: '' }))}
                        className="inline-flex items-center gap-2 rounded-xl border border-forge-border px-4 py-2 text-sm text-forge-text-primary/70 transition-all hover:bg-forge-surface-3 hover:text-forge-text-primary"
                      >
                        <X className="h-4 w-4" />
                        Remove
                      </button>
                    </div>
                    <input
                      className="forge-input"
                      value={form.avatar_url}
                      onChange={(event) => setForm((current) => ({ ...current, avatar_url: event.target.value }))}
                      placeholder="Paste an image URL instead"
                    />
                  </div>
                </div>

                <div>
                  <label className="forge-label">Role</label>
                  <input className="forge-input opacity-70" value={form.role} readOnly />
                </div>

                <div>
                  <label className="forge-label">Timezone</label>
                  <select className="forge-input" value={form.timezone} onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))}>
                    {TIMEZONE_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="forge-label">Notification Email</label>
                  <input type="email" className="forge-input" value={form.notification_email} onChange={(event) => setForm((current) => ({ ...current, notification_email: event.target.value }))} />
                  <p className="mt-2 text-xs text-forge-text-muted">Email for new booking and check-in alerts</p>
                </div>
              </div>

              <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-5 space-y-4">
                <div>
                  <p className="text-xs font-mono uppercase tracking-widest text-forge-text-muted">Security</p>
                  <h2 className="mt-3 text-sm font-semibold text-forge-text-primary">Change Password</h2>
                  <p className="mt-2 text-sm text-forge-text-secondary">Leave both password fields empty if you do not want to change your password.</p>
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

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => void handleLogout()} disabled={loggingOut}
                className="inline-flex items-center gap-2 rounded-xl border border-forge-border px-4 py-2 text-sm text-forge-text-primary/65 hover:text-forge-text-primary hover:bg-forge-surface-3/70 disabled:opacity-50">
                {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                {loggingOut ? 'Logging out...' : 'Logout'}
              </button>
              <button type="submit" disabled={saving} className="forge-btn-gold inline-flex items-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        )}

        <BusinessHoursCard canEdit={form.role === 'admin'} />
        <TeamAccessCard canManage={form.role === 'admin' && form.email.toLowerCase() === 'coach@dfitfactor.com'} currentUserId={form.id} />

        <section className="rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-5 space-y-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-mono uppercase tracking-widest text-forge-text-muted">Templates</p>
              <h2 className="mt-3 text-sm font-semibold text-forge-text-primary">Coach Template Library</h2>
              <p className="mt-2 text-sm text-forge-text-secondary">
                Build reusable movement, nutrition, and habit coaching templates your team can reuse across clients.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openCreateTemplate(activeTemplateType)}
              className="forge-btn-gold inline-flex items-center gap-2 text-sm"
            >
              <Plus className="h-4 w-4" />
              New Template
            </button>
          </div>

          {templateError ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{templateError}</div> : null}
          {templateSuccess ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">{templateSuccess}</div> : null}

          <div className="flex gap-2 flex-wrap">
            {TEMPLATE_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => setActiveTemplateType(type.value)}
                className={`rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                  activeTemplateType === type.value
                    ? 'bg-forge-gold text-forge-purple-dark'
                    : 'bg-forge-surface-3/80 text-forge-text-secondary hover:text-forge-text-primary'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>

          {showTemplateForm ? (
            <form onSubmit={handleTemplateSave} className="rounded-2xl border border-forge-gold/20 bg-forge-surface-3/60 p-5 space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-mono uppercase tracking-widest text-forge-text-muted">
                    {editingTemplateId ? 'Edit Template' : 'Create Template'}
                  </p>
                  <p className="mt-1 text-sm text-forge-text-secondary">Template text can be used later as a reusable coaching starting point.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowTemplateForm(false)
                    setEditingTemplateId(null)
                    setTemplateForm({ ...INITIAL_TEMPLATE_FORM, template_type: activeTemplateType })
                  }}
                  className="rounded-lg border border-forge-border px-3 py-2 text-xs text-forge-text-primary/65 hover:text-forge-text-primary"
                >
                  Cancel
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="forge-label">Template Type</label>
                  <select
                    className="forge-input"
                    value={templateForm.template_type}
                    onChange={(event) => setTemplateForm((current) => ({ ...current, template_type: event.target.value as TemplateFormState['template_type'] }))}
                  >
                    {TEMPLATE_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="forge-label">Sort Order</label>
                  <input
                    type="number"
                    className="forge-input"
                    value={templateForm.sort_order}
                    onChange={(event) => setTemplateForm((current) => ({ ...current, sort_order: event.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="forge-label">Template Name</label>
                <input
                  className="forge-input"
                  value={templateForm.name}
                  onChange={(event) => setTemplateForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="e.g. Foundations Protein Reset"
                />
              </div>

              <div>
                <label className="forge-label">Description</label>
                <textarea
                  className="forge-input min-h-[90px]"
                  value={templateForm.description}
                  onChange={(event) => setTemplateForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Short note about when this template should be used."
                />
              </div>

              <div>
                <label className="forge-label">Template Content</label>
                <textarea
                  className="forge-input min-h-[220px]"
                  value={templateForm.template_text}
                  onChange={(event) => setTemplateForm((current) => ({ ...current, template_text: event.target.value }))}
                  placeholder="Write the reusable movement structure, nutrition framework, or habit coaching sequence here."
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-forge-border/70 bg-forge-surface-3/60 px-4 py-3">
                <span className="text-sm text-forge-text-primary/65">Active Template</span>
                <button
                  type="button"
                  onClick={() => setTemplateForm((current) => ({ ...current, is_active: !current.is_active }))}
                  className="text-forge-text-secondary hover:text-forge-text-primary"
                >
                  {templateForm.is_active ? <ToggleRight className="h-6 w-6 text-emerald-400" /> : <ToggleLeft className="h-6 w-6" />}
                </button>
              </div>

              <div className="flex justify-end">
                <button type="submit" disabled={templateSaving} className="forge-btn-gold inline-flex items-center gap-2 disabled:opacity-50">
                  {templateSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {templateSaving ? 'Saving...' : editingTemplateId ? 'Update Template' : 'Create Template'}
                </button>
              </div>
            </form>
          ) : null}

          {templatesLoading ? (
            <div className="rounded-xl border border-forge-border/70 bg-forge-surface-3/60 p-8 text-center text-forge-text-muted">
              <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />
              Loading template library...
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-forge-border bg-forge-surface-3/60 p-10 text-center">
              <BookTemplate className="mx-auto mb-3 h-7 w-7 text-forge-text-muted/70" />
              <p className="text-sm text-forge-text-secondary">No templates yet in this category.</p>
              <button type="button" onClick={() => openCreateTemplate(activeTemplateType)} className="mt-4 forge-btn-gold inline-flex items-center gap-2 text-sm">
                <Plus className="h-4 w-4" />
                Create First Template
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTemplates.map((template) => (
                <div key={template.id} className="rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2 min-w-0">
                      <div className="flex flex-wrap gap-2">
                        <p className="text-sm font-semibold text-forge-text-primary">{template.name}</p>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                          template.is_active
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                            : 'border-forge-border bg-forge-surface-3/70 text-forge-text-muted'
                        }`}>
                          {template.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      {template.description ? <p className="text-sm text-forge-text-secondary">{template.description}</p> : null}
                      <p className="text-xs text-forge-text-muted">Updated {formatDateTime(template.updated_at)} Â· Sort {template.sort_order}</p>
                      <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-forge-border/70 bg-forge-surface-2 p-4 text-xs text-forge-text-primary/60">
                        {template.template_text}
                      </pre>
                    </div>
                    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-shrink-0">
                      <button type="button" onClick={() => toggleTemplateActive(template)} className="text-forge-text-primary/60 hover:text-forge-text-primary">
                        {template.is_active ? <ToggleRight className="h-6 w-6 text-emerald-400" /> : <ToggleLeft className="h-6 w-6" />}
                      </button>
                      <button type="button" onClick={() => openEditTemplate(template)} className="rounded-lg border border-forge-border px-3 py-2 text-xs text-forge-text-secondary hover:text-forge-text-primary inline-flex items-center gap-2">
                        <SquarePen className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteTemplate(template.id)}
                        disabled={templateDeletingId === template.id}
                        className="rounded-lg border border-red-500/20 px-3 py-2 text-xs text-red-300 hover:text-red-200 inline-flex items-center gap-2 disabled:opacity-50"
                      >
                        {templateDeletingId === template.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-5 space-y-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-mono uppercase tracking-widest text-forge-text-muted">Client Portal</p>
              <h2 className="mt-3 text-sm font-semibold text-forge-text-primary">Portal Login Test</h2>
              <p className="mt-2 text-sm text-forge-text-secondary">
                Send a one-time portal login link to a client email and confirm whether the address matches an active client record.
              </p>
            </div>
          </div>

          {portalTestError ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{portalTestError}</div> : null}
          {portalTestSuccess ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">{portalTestSuccess}</div> : null}
          {portalTestLink ? (
            <div className="rounded-xl border border-forge-gold/25 bg-forge-gold/10 px-4 py-3 text-sm text-forge-purple-dark dark:text-forge-gold-light">
              <p className="font-medium text-forge-gold">Fallback magic link</p>
              <p className="mt-1 break-all text-forge-text-primary/75">{portalTestLink}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(portalTestLink)}
                  className="rounded-lg border border-forge-border px-3 py-2 text-xs text-forge-text-primary/75 hover:text-forge-text-primary"
                >
                  Copy Link
                </button>
                <a
                  href={portalTestLink}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-forge-border px-3 py-2 text-xs text-forge-text-primary/75 hover:text-forge-text-primary"
                >
                  Open Link
                </a>
              </div>
            </div>
          ) : null}

          <form onSubmit={handlePortalTest} className="grid gap-4 md:grid-cols-[1fr_auto]">
            <div>
              <label className="forge-label">Client Email</label>
              <input
                type="email"
                className="forge-input"
                value={portalTestEmail}
                onChange={(event) => setPortalTestEmail(event.target.value)}
                placeholder="client@email.com"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={portalTestLoading}
                className="forge-btn-gold inline-flex w-full items-center justify-center gap-2 disabled:opacity-50 md:w-auto"
              >
                {portalTestLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {portalTestLoading ? 'Sending...' : 'Send Test Link'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}




