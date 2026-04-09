'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, Copy, Eye, ExternalLink, Plus, SquarePen, X } from 'lucide-react'
import {
  BILLING_TYPES,
  BOOKING_TYPES,
  FORGE_STAGE_OPTIONS,
  REQUIRED_FORM_TYPES,
  SERVICE_CATEGORIES,
  SERVICE_SECTION_OPTIONS,
  SERVICE_TYPES,
  formatDurationLabel,
  formatPriceFromCents,
  slugify,
  stageLabel,
} from '@/lib/booking'

type Service = Record<string, any>
type Package = Record<string, any>
type FormTemplate = Record<string, any>
type Tab = 'services' | 'packages' | 'forms'
type ServiceSection = {
  id: string
  title: string
  description: string
  serviceNames: string[]
}
type PackageSection = {
  id: 'signature' | 'additional'
  title: string
  description: string
  stages: string[]
}

const SERVICE_SECTIONS: ServiceSection[] = [
  {
    id: 'assessments',
    title: 'Assessments & Intake',
    description: 'Baseline evaluations, insight sessions, and onboarding touchpoints.',
    serviceNames: [
      'The Starting Point Assessment',
      'F.I.T. Index Insight Session',
      'DFit PractitionerBridge Report',
    ],
  },
  {
    id: 'training',
    title: 'Training & Coaching Sessions',
    description: 'Bookable training delivery sessions, including private training, small-group/coached session types, makeups, concierge, youth, and training add-ons.',
    serviceNames: [
      '1:1 PT (30 mins)',
      '1:1 PT Makeup',
      'Flex Single Session',
      'Student/Athlete',
      'EmpowerVIP Concierge PT',
      'SP Coaching (30mins)',
      'SCSP Coaching (30mins)',
      'Session Extension (15 min add-on)',
    ],
  },
  {
    id: 'progress',
    title: 'Progress & Accountability',
    description: 'Check-ins, habit support, and progress-based coaching touchpoints that are not primary training sessions.',
    serviceNames: [
      'DFit ProgressPulse Coaching Check-In',
      'HabitForge Habit Coaching',
      'SP Coaching Waitlist',
    ],
  },
  {
    id: 'nutrition',
    title: 'Nutrition Services',
    description: 'Nutrition-focused sessions for planning, coaching, and targeted support.',
    serviceNames: [
      'DFit FuelMap Mini',
      'FuelMap Coaching Session',
    ],
  },
  {
    id: 'wellness',
    title: 'Wellness & Strategy Sessions',
    description: 'Lifestyle, supplement, and wellness support sessions designed to deepen client alignment and implementation.',
    serviceNames: [
      'DFit Lifestyle Reset Session',
      'DFit Supplement Strategy Boost',
      'EmpowerCheck Wellness Alignment (Add-On)',
      'EmpowerCheck Wellness Alignment (Included)',
    ],
  },
]

const PACKAGE_SECTIONS: PackageSection[] = [
  {
    id: 'signature',
    title: 'Signature Offerings',
    description: 'Core FORGE pathways and primary client progression packages.',
    stages: ['foundations', 'optimization', 'resilience', 'growth', 'empowerment'],
  },
  {
    id: 'additional',
    title: 'Additional Services',
    description: 'Specialty and support packages for youth, nutrition, and flexible delivery.',
    stages: ['youth', 'nutrition', 'flex'],
  },
]

function Toggle({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${checked ? 'bg-forge-gold' : 'bg-forge-surface-3'}`}>
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
    </button>
  )
}

function SlideOver({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
      <button className="flex-1" onClick={onClose} aria-label="Close panel" />
      <div className="h-full w-full max-w-xl overflow-y-auto border-l border-forge-border bg-forge-surface-2 p-4 md:p-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-forge-text-primary">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-2 text-forge-text-muted hover:bg-forge-surface-3/70 hover:text-forge-text-primary">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function parsePreviewFields(fields: unknown) {
  if (Array.isArray(fields)) return fields
  if (fields && typeof fields === 'object' && Array.isArray((fields as { fields?: unknown[] }).fields)) {
    return (fields as { fields: unknown[] }).fields
  }
  return []
}

function FormPreview({ template }: { template: FormTemplate }) {
  const fields = Array.isArray(template.fields)
    ? template.fields
    : []

  if (fields.length === 0) {
    return (
      <p style={{ color: 'rgb(var(--forge-text-muted))', fontSize: '14px' }}>
        No fields configured for this form template.
      </p>
    )
  }

  const sections = fields.reduce((acc: Record<string, Record<string, any>[]>, field: Record<string, any>) => {
    const section = field.section || 'General'
    if (!acc[section]) acc[section] = []
    acc[section].push(field)
    return acc
  }, {})

  return (
    <div style={{ fontSize: '14px' }}>
      {(Object.entries(sections) as Array<[string, Record<string, any>[]]>).map(([section, sectionFields]) => (
        <div key={section} style={{ marginBottom: '20px' }}>
          <p style={{
            color: 'rgb(var(--forge-gold))',
            fontWeight: 'bold',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '10px',
            borderBottom: '1px solid rgba(var(--forge-gold), 0.2)',
            paddingBottom: '6px'
          }}>
            {section}
          </p>
          {sectionFields.map((field) => (
            <div key={field.id || `${section}-${field.label || field.type}`} style={{
              marginBottom: '12px',
              paddingLeft: '8px'
            }}>
              <p style={{ color: 'rgb(var(--forge-text-primary))', marginBottom: '4px' }}>
                {field.label}
                {field.required && (
                  <span style={{ color: '#f87171', marginLeft: '4px' }}>*</span>
                )}
                {field.readonly && (
                  <span style={{
                    color: 'rgb(var(--forge-text-muted))',
                    fontSize: '11px',
                    marginLeft: '8px'
                  }}>
                    (pre-filled)
                  </span>
                )}
              </p>
              <p style={{ color: 'rgb(var(--forge-text-secondary))', fontSize: '12px' }}>
                Type: {field.type}
                {field.options && ` - Options: ${field.options.join(' | ')}`}
                {field.min !== undefined && ` - Range: ${field.min}-${field.max}`}
              </p>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function serviceSectionLabel(sectionId: string | null | undefined) {
  const match = SERVICE_SECTIONS.find((section) => section.id === sectionId)
  return match?.title ?? 'Unassigned'
}

function getPublicBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://forge-css.vercel.app'
}

type IncludedPackageService = {
  service_id: string
  monthly_session_allotment: number
  service_name: string
}

function normalizeIncludedServices(value: unknown): IncludedPackageService[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const typed = item as Record<string, unknown>
      const serviceId = typeof typed.service_id === 'string' ? typed.service_id : ''
      if (!serviceId) return null
      const monthlySessionAllotment = Number(typed.monthly_session_allotment ?? 0)
      return {
        service_id: serviceId,
        monthly_session_allotment: monthlySessionAllotment > 0 ? monthlySessionAllotment : 1,
        service_name: typeof typed.service_name === 'string' ? typed.service_name : '',
      }
    })
    .filter((item): item is IncludedPackageService => Boolean(item))
}

function packageIncludedServicesSummary(value: unknown) {
  const services = normalizeIncludedServices(value)
  if (services.length === 0) return 'No linked bookable sessions'
  return services
    .map((service) => `${service.service_name || 'Attached service'} - ${service.monthly_session_allotment}/month`)
    .join(', ')
}

function buildBookingLink(slug: string | null | undefined) {
  if (!slug) return ''
  return `${getPublicBaseUrl()}/book/${slug}`
}
export default function ServicesPage() {
  const [stageOrder, setStageOrder] = useState<string[]>(() =>
    PACKAGE_SECTIONS.flatMap((section) => section.stages)
  )
  const [serviceSectionOverrides, setServiceSectionOverrides] = useState<Record<string, string | null>>({})
  const [expandedServiceSections, setExpandedServiceSections] = useState<Record<string, boolean>>(() =>
    SERVICE_SECTIONS.reduce<Record<string, boolean>>((acc, section, index) => ({
      ...acc,
      [section.id]: index === 0,
    }), { unassigned: true })
  )
  const [tab, setTab] = useState<Tab>('services')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [services, setServices] = useState<Service[]>([])
  const [packages, setPackages] = useState<Package[]>([])
  const [templates, setTemplates] = useState<FormTemplate[]>([])
  const [serviceEditor, setServiceEditor] = useState<Service | null>(null)
  const [packageEditor, setPackageEditor] = useState<Package | null>(null)
  const [templateEditor, setTemplateEditor] = useState<FormTemplate | null>(null)
  const [templatePreview, setTemplatePreview] = useState<FormTemplate | null>(null)
  const [serviceForm, setServiceForm] = useState<any>({})
  const [packageForm, setPackageForm] = useState<any>({})
  const [templateForm, setTemplateForm] = useState<any>({})
  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>(() =>
    FORGE_STAGE_OPTIONS.reduce<Record<string, boolean>>((acc, stage, index) => ({
      ...acc,
      [stage]: index === 0,
    }), {})
  )

  async function loadAll() {
    setLoading(true)
    setError('')
    try {
      const [servicesRes, packagesRes, formsRes] = await Promise.all([
        fetch('/api/services', { cache: 'no-store' }),
        fetch('/api/packages', { cache: 'no-store' }),
        fetch('/api/forms', { cache: 'no-store' }),
      ])
      const [servicesData, packagesData, formsData] = await Promise.all([
        servicesRes.json().catch(() => ({})),
        packagesRes.json().catch(() => ({})),
        formsRes.json().catch(() => ({})),
      ])
      if (!servicesRes.ok) throw new Error(servicesData.error ?? 'Failed to load services')
      if (!packagesRes.ok) throw new Error(packagesData.error ?? 'Failed to load packages')
      if (!formsRes.ok) throw new Error(formsData.error ?? 'Failed to load forms')
      setServices(servicesData.services ?? [])
      setPackages(packagesData.packages ?? [])
      setTemplates(formsData.templates ?? [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load services dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadAll() }, [])
  async function copyBookingLink(slug: string | null | undefined) {
    const link = buildBookingLink(slug)
    if (!link) {
      setError('Missing booking slug for public link')
      return
    }

    try {
      await navigator.clipboard.writeText(link)
      setError(`Copied booking link: ${link}`)
      window.setTimeout(() => setError(''), 2500)
    } catch {
      setError('Failed to copy booking link')
    }
  }

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('forge-package-stage-order') : null
    if (!stored) return
    try {
      const parsed = JSON.parse(stored) as string[]
      const valid = parsed.filter((stage) => FORGE_STAGE_OPTIONS.includes(stage as typeof FORGE_STAGE_OPTIONS[number]))
      const defaultStages = PACKAGE_SECTIONS.flatMap((section) => section.stages)
      const missing = defaultStages.filter((stage) => !valid.includes(stage))
      setStageOrder([...valid, ...missing])
    } catch {
      setStageOrder(PACKAGE_SECTIONS.flatMap((section) => section.stages))
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('forge-package-stage-order', JSON.stringify(stageOrder))
  }, [stageOrder])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem('forge-service-section-overrides')
    if (!stored) return
    try {
      setServiceSectionOverrides(JSON.parse(stored) as Record<string, string | null>)
    } catch {
      setServiceSectionOverrides({})
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('forge-service-section-overrides', JSON.stringify(serviceSectionOverrides))
  }, [serviceSectionOverrides])

  const groupedPackages = useMemo(
    () => FORGE_STAGE_OPTIONS.reduce<Record<string, Package[]>>((acc, stage) => ({ ...acc, [stage]: packages.filter(item => item.forge_stage === stage) }), {}),
    [packages]
  )
  const groupedServices = useMemo(() => {
    const sectionByName = new Map<string, string>()
    const orderByName = new Map<string, number>()

    SERVICE_SECTIONS.forEach((section) => {
      section.serviceNames.forEach((name, index) => {
        sectionByName.set(name, section.id)
        orderByName.set(name, index)
      })
    })

    const initial = SERVICE_SECTIONS.reduce<Record<string, Service[]>>((acc, section) => {
      acc[section.id] = []
      return acc
    }, { unassigned: [] as Service[] })

    for (const service of services) {
      const explicitSection = typeof service.section === 'string'
        ? service.section
        : (serviceSectionOverrides[String(service.id)] ?? null)
      const sectionId = (explicitSection && SERVICE_SECTION_OPTIONS.includes(explicitSection as typeof SERVICE_SECTION_OPTIONS[number]))
        ? explicitSection
        : (sectionByName.get(String(service.name)) ?? 'unassigned')
      initial[sectionId] = [...(initial[sectionId] ?? []), service]
    }

    for (const section of SERVICE_SECTIONS) {
      initial[section.id] = [...(initial[section.id] ?? [])].sort((a, b) => {
        const aOrder = orderByName.get(String(a.name)) ?? Number.MAX_SAFE_INTEGER
        const bOrder = orderByName.get(String(b.name)) ?? Number.MAX_SAFE_INTEGER
        if (aOrder !== bOrder) return aOrder - bOrder
        return String(a.name ?? '').localeCompare(String(b.name ?? ''))
      })
    }

    initial.unassigned = [...(initial.unassigned ?? [])].sort((a, b) => {
      return String(a.name ?? '').localeCompare(String(b.name ?? ''))
    })

    return initial
  }, [serviceSectionOverrides, services])

  function toggleStage(stage: string) {
    setExpandedStages((current) => ({
      ...current,
      [stage]: !current[stage],
    }))
  }

  function toggleServiceSection(sectionId: string) {
    setExpandedServiceSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }))
  }

  function reorderStage(stage: string, direction: 'up' | 'down') {
    setStageOrder((current) => {
      const currentIndex = current.indexOf(stage)
      if (currentIndex < 0) return current
      const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
      if (swapIndex < 0 || swapIndex >= current.length) return current
      const next = [...current]
      ;[next[currentIndex], next[swapIndex]] = [next[swapIndex], next[currentIndex]]
      return next
    })
  }

  async function reorderPackage(stage: string, packageId: string, direction: 'up' | 'down') {
    const stagePackages = [...(groupedPackages[stage] ?? [])].sort((a, b) => {
      const aOrder = Number(a.sort_order ?? 0)
      const bOrder = Number(b.sort_order ?? 0)
      if (aOrder !== bOrder) return aOrder - bOrder
      return String(a.name ?? '').localeCompare(String(b.name ?? ''))
    })

    const currentIndex = stagePackages.findIndex((item) => item.id === packageId)
    if (currentIndex < 0) return

    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (swapIndex < 0 || swapIndex >= stagePackages.length) return

    setSaving(true)
    setError('')
    try {
      const normalized = stagePackages.map((item, index) => ({
        ...item,
        next_sort_order: index,
      })) as Array<Package & { next_sort_order: number }>
      const currentPackage = normalized[currentIndex]
      const swapPackage = normalized[swapIndex]

      const currentOrder = currentPackage.next_sort_order
      const swapOrder = swapPackage.next_sort_order

      const [firstRes, secondRes] = await Promise.all([
        fetch(`/api/packages/${currentPackage.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order: swapOrder }),
        }),
        fetch(`/api/packages/${swapPackage.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order: currentOrder }),
        }),
      ])

      if (!firstRes.ok || !secondRes.ok) {
        const firstData = await firstRes.json().catch(() => ({}))
        const secondData = await secondRes.json().catch(() => ({}))
        throw new Error(firstData.error ?? secondData.error ?? 'Failed to reorder package')
      }

      await loadAll()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reorder package')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(kind: 'services' | 'packages' | 'forms', id: string, is_active: boolean) {
    const url = kind === 'forms' ? `/api/forms/${id}` : `/api/${kind}/${id}`
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active }),
    })
    if (res.ok) await loadAll()
  }

  async function save(kind: 'services' | 'packages' | 'forms') {
    setSaving(true)
    try {
      if (kind === 'services') {
        const editor = serviceEditor
        const res = await fetch(editor?.id ? `/api/services/${editor.id}` : '/api/services', {
          method: editor?.id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...serviceForm,
            slug: slugify(serviceForm.slug || serviceForm.name || ''),
            price_cents: Math.round(Number(serviceForm.price_dollars || 0) * 100),
            duration_minutes: Number(serviceForm.duration_minutes || 60),
            sort_order: Number(serviceForm.sort_order || 0),
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Failed to save service')
        const savedService = data.service
        const serviceId = String(savedService?.id ?? editor?.id ?? '')
        const nextSection = serviceForm.section ?? null
        if (serviceId) {
          setServiceSectionOverrides((current) => {
            const next = { ...current }
            if (typeof savedService?.section === 'string' || savedService?.section === null) {
              delete next[serviceId]
            } else {
              next[serviceId] = nextSection
            }
            return next
          })
        }
        setServiceEditor(null)
      }

      if (kind === 'packages') {
        const editor = packageEditor
        const res = await fetch(editor?.id ? `/api/packages/${editor.id}` : '/api/packages', {
          method: editor?.id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...packageForm,
            slug: slugify(packageForm.slug || packageForm.name || ''),
            price_cents: Math.round(Number(packageForm.price_dollars || 0) * 100),
            duration_minutes: Number(packageForm.duration_minutes || 60),
            session_count: Number(packageForm.session_count || 1),
            billing_period_months: Number(packageForm.billing_period_months || 1),
            sort_order: Number(packageForm.sort_order || 0),
          }),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to save package')
        setPackageEditor(null)
      }

      if (kind === 'forms' && templateEditor) {
        const res = await fetch(`/api/forms/${templateEditor.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: templateForm.name,
            description: templateForm.description,
            requires_signature: Boolean(templateForm.requires_signature),
            validity_days: templateForm.validity_days ? Number(templateForm.validity_days) : null,
            is_active: Boolean(templateForm.is_active),
            fields: JSON.parse(templateForm.fields),
          }),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to save form template')
        setTemplateEditor(null)
      }

      await loadAll()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-forge-surface p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-forge-gold">Services</h1>
          <p className="mt-1 text-sm text-forge-text-muted">Bookable services, packages, and form templates.</p>
        </div>

        {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div> : null}

        <div className="flex gap-2 rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-2">
          {(['services', 'packages', 'forms'] as Tab[]).map(item => (
            <button key={item} onClick={() => setTab(item)} className={`rounded-xl px-4 py-2 text-sm ${tab === item ? 'bg-forge-gold text-forge-purple-dark' : 'text-forge-text-secondary hover:bg-forge-surface-3/70 hover:text-forge-text-primary'}`}>
              {item.charAt(0).toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>

        {loading ? <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-10 text-center text-forge-text-muted">Loading...</div> : null}

        {!loading && tab === 'services' ? (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={() => { setServiceEditor({} as Service); setServiceForm({ name: '', slug: '', description: '', duration_minutes: 60, price_dollars: '0.00', category: 'assessment', section: 'assessments', service_type: 'single', booking_type: 'scheduled', required_forms: [], forge_stage: '', is_public: true, sort_order: 0 }) }} className="forge-btn-gold flex items-center gap-2">
                <Plus size={15} /> Add Service
              </button>
            </div>
            {[...SERVICE_SECTIONS, { id: 'unassigned', title: 'Unassigned Services', description: 'New or uncategorized services that do not yet map to a booking section.', serviceNames: [] }].map((section) => {
              const sectionServices = groupedServices[section.id] ?? []
              if (section.id === 'unassigned' && sectionServices.length === 0) return null

              return (
                <section key={section.id} className="space-y-3">
                  <button
                    type="button"
                    onClick={() => toggleServiceSection(section.id)}
                    className="flex w-full items-center justify-between rounded-2xl border border-forge-border/70 bg-forge-surface-2 px-5 py-4 text-left transition hover:border-forge-gold/30 hover:bg-forge-surface-3"
                  >
                    <div>
                      <div className="flex items-center gap-3">
                        <h2 className="text-sm font-semibold text-forge-gold">{section.title}</h2>
                        <span className="rounded-full border border-forge-gold/20 bg-forge-gold/10 px-2 py-0.5 text-xs text-forge-gold">{sectionServices.length}</span>
                      </div>
                      <p className="mt-1 text-sm text-forge-text-muted">{section.description}</p>
                    </div>
                    <ChevronDown size={16} className={`text-forge-text-muted transition-transform ${expandedServiceSections[section.id] ? 'rotate-180' : ''}`} />
                  </button>

                  {expandedServiceSections[section.id] ? (
                    <div className="overflow-hidden rounded-2xl border border-forge-border/70 bg-forge-surface-2">
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead className="bg-forge-surface-3/70 text-left text-xs uppercase tracking-widest text-forge-text-muted"><tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Duration</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Booking Section</th><th className="px-4 py-3">Public Link</th><th className="px-4 py-3">Active</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
                          <tbody>{sectionServices.map(service => {
                            const bookingLink = buildBookingLink(service.slug)
                            return <tr key={service.id} className="border-t border-forge-border/60 text-forge-text-secondary"><td className="px-4 py-3"><div className="font-medium text-forge-text-primary">{service.name}</div><div className="text-xs text-forge-text-muted">{service.slug}</div></td><td className="px-4 py-3">{formatDurationLabel(service.duration_minutes)}</td><td className="px-4 py-3">{formatPriceFromCents(service.price_cents)}</td><td className="px-4 py-3 capitalize">{service.service_type}</td><td className="px-4 py-3 capitalize">{service.category}</td><td className="px-4 py-3">{serviceSectionLabel(typeof service.section === 'string' ? service.section : (serviceSectionOverrides[String(service.id)] ?? (section.id === 'unassigned' ? null : section.id)))}</td><td className="px-4 py-3"><div className="max-w-[220px] space-y-2"><div className="truncate text-xs text-forge-text-secondary">{service.is_public ? bookingLink : 'Private service'}</div>{service.is_public ? <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void copyBookingLink(service.slug)} className="inline-flex items-center gap-1 rounded-lg border border-forge-border px-2 py-1 text-[11px] text-forge-text-secondary hover:text-forge-text-primary"><Copy size={12} /> Copy</button><a href={bookingLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-forge-border px-2 py-1 text-[11px] text-forge-text-secondary hover:text-forge-text-primary"><ExternalLink size={12} /> Preview</a></div> : null}</div></td><td className="px-4 py-3"><Toggle checked={Boolean(service.is_active)} onChange={next => void toggleActive('services', service.id, next)} /></td><td className="px-4 py-3 text-right"><button onClick={() => { setServiceEditor(service); setServiceForm({ ...service, section: service.section ?? (section.id === 'unassigned' ? null : section.id), price_dollars: (service.price_cents / 100).toFixed(2), required_forms: service.required_forms ?? [] }) }} className="inline-flex items-center gap-2 rounded-lg border border-forge-border px-3 py-1.5 text-xs text-forge-text-secondary hover:text-forge-text-primary"><SquarePen size={13} /> Edit</button></td></tr>
                          })}</tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </section>
              )
            })}
          </div>
        ) : null}

        {!loading && tab === 'packages' ? (
          <div className="space-y-6">
            <div className="flex justify-end">
              <button onClick={() => { setPackageEditor({} as Package); setPackageForm({ name: '', slug: '', description: '', session_count: 4, duration_minutes: 60, price_dollars: '0.00', billing_type: 'monthly', billing_period_months: 1, forge_stage: 'foundations', is_public: true, sort_order: 0, included_services: [] }) }} className="forge-btn-gold flex items-center gap-2">
                <Plus size={15} /> Add Package
              </button>
            </div>
            {PACKAGE_SECTIONS.map((section) => {
              const orderedStages = stageOrder.filter((stage) => section.stages.includes(stage))
              return (
                <section key={section.id} className="space-y-4">
                  <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-2 px-5 py-4">
                    <h2 className="text-base font-semibold text-forge-gold">{section.title}</h2>
                    <p className="mt-1 text-sm text-forge-text-muted">{section.description}</p>
                  </div>
                  {orderedStages.map((stage, sectionIndex) => (
                    <section key={stage} className="space-y-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleStage(stage)}
                          className="flex flex-1 items-center justify-between rounded-2xl border border-forge-border/70 bg-forge-surface-2 px-5 py-4 text-left transition hover:border-forge-gold/30 hover:bg-forge-surface-3"
                        >
                          <div className="flex items-center gap-3">
                            <h2 className="text-sm font-semibold text-forge-text-primary">{stageLabel(stage)}</h2>
                            <span className="rounded-full border border-forge-gold/20 bg-forge-gold/10 px-2 py-0.5 text-xs text-forge-gold">{groupedPackages[stage]?.length ?? 0}</span>
                          </div>
                          <ChevronDown size={16} className={`text-forge-text-muted transition-transform ${expandedStages[stage] ? 'rotate-180' : ''}`} />
                        </button>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={sectionIndex === 0}
                            onClick={() => reorderStage(stage, 'up')}
                            className="rounded-xl border border-forge-border bg-forge-surface-2 p-3 text-forge-text-secondary hover:bg-forge-surface-3 hover:text-forge-text-primary disabled:cursor-not-allowed disabled:opacity-35"
                            aria-label={`Move ${stageLabel(stage)} up`}
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            disabled={sectionIndex === orderedStages.length - 1}
                            onClick={() => reorderStage(stage, 'down')}
                            className="rounded-xl border border-forge-border bg-forge-surface-2 p-3 text-forge-text-secondary hover:bg-forge-surface-3 hover:text-forge-text-primary disabled:cursor-not-allowed disabled:opacity-35"
                            aria-label={`Move ${stageLabel(stage)} down`}
                          >
                            <ArrowDown size={14} />
                          </button>
                        </div>
                      </div>
                      {expandedStages[stage] ? (
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{(groupedPackages[stage] ?? []).map((pkg, index, items) => <div key={pkg.id} className="rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-forge-text-primary">{pkg.name}</h3><p className="mt-1 text-sm text-forge-text-muted">{pkg.session_count} sessions</p><p className="mt-2 max-w-xs text-xs text-forge-text-muted">{packageIncludedServicesSummary(pkg.included_services)}</p></div><Toggle checked={Boolean(pkg.is_active)} onChange={next => void toggleActive('packages', pkg.id, next)} /></div><div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full border border-forge-border bg-forge-surface-3/70 px-2 py-1 text-xs text-forge-text-secondary">{formatPriceFromCents(pkg.price_cents)}</span><span className="rounded-full border border-forge-gold/20 bg-forge-gold/10 px-2 py-1 text-xs capitalize text-forge-gold">{pkg.billing_type}</span>{pkg.billing_period_months > 1 ? <span className="rounded-full border border-forge-border bg-forge-surface-3/70 px-2 py-1 text-xs text-forge-text-secondary">{pkg.billing_period_months} months</span> : null}</div><div className="mt-5 flex items-center justify-between gap-3"><div className="text-xs text-forge-text-muted">{formatDurationLabel(pkg.duration_minutes)} each</div><div className="flex items-center gap-2"><div className="flex items-center gap-1"><button type="button" disabled={saving || index === 0} onClick={() => void reorderPackage(stage, pkg.id, 'up')} className="rounded-lg border border-forge-border p-2 text-forge-text-secondary hover:bg-forge-surface-3/70 hover:text-forge-text-primary disabled:cursor-not-allowed disabled:opacity-35" aria-label={`Move ${pkg.name} up`}><ArrowUp size={13} /></button><button type="button" disabled={saving || index === items.length - 1} onClick={() => void reorderPackage(stage, pkg.id, 'down')} className="rounded-lg border border-forge-border p-2 text-forge-text-secondary hover:bg-forge-surface-3/70 hover:text-forge-text-primary disabled:cursor-not-allowed disabled:opacity-35" aria-label={`Move ${pkg.name} down`}><ArrowDown size={13} /></button></div><button onClick={() => { setPackageEditor(pkg); setPackageForm({ ...pkg, price_dollars: (pkg.price_cents / 100).toFixed(2), included_services: normalizeIncludedServices(pkg.included_services) }) }} className="inline-flex items-center gap-2 rounded-lg border border-forge-border px-3 py-1.5 text-xs text-forge-text-secondary hover:text-forge-text-primary"><SquarePen size={13} /> Edit</button></div></div></div>)}</div>
                      ) : null}
                    </section>
                  ))}
                </section>
              )
            })}
          </div>
        ) : null}

        {!loading && tab === 'forms' ? (
          <div className="overflow-hidden rounded-2xl border border-forge-border/70 bg-forge-surface-2">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-forge-surface-3/70 text-left text-xs uppercase tracking-widest text-forge-text-muted"><tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Requires Signature</th><th className="px-4 py-3">Validity</th><th className="px-4 py-3">Active</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
                <tbody>{templates.map(template => <tr key={template.id} className="border-t border-forge-border/60 text-forge-text-secondary"><td className="px-4 py-3"><div className="font-medium text-forge-text-primary">{template.name}</div><div className="text-xs text-forge-text-muted">{template.description}</div></td><td className="px-4 py-3 capitalize">{template.form_type}</td><td className="px-4 py-3">{template.requires_signature ? 'Yes' : 'No'}</td><td className="px-4 py-3">{template.validity_days ? `${template.validity_days} days` : 'Never expires'}</td><td className="px-4 py-3"><Toggle checked={Boolean(template.is_active)} onChange={next => void toggleActive('forms', template.id, next)} /></td><td className="px-4 py-3"><div className="flex justify-end gap-2"><button onClick={() => setTemplatePreview(template)} className="inline-flex items-center gap-2 rounded-lg border border-forge-border px-3 py-1.5 text-xs text-forge-text-secondary hover:text-forge-text-primary"><Eye size={13} /> Preview Form</button><button onClick={() => { setTemplateEditor(template); setTemplateForm({ ...template, validity_days: template.validity_days ?? '', fields: JSON.stringify(template.fields, null, 2) }) }} className="inline-flex items-center gap-2 rounded-lg border border-forge-border px-3 py-1.5 text-xs text-forge-text-secondary hover:text-forge-text-primary"><SquarePen size={13} /> Edit</button></div></td></tr>)}</tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      <SlideOver title={serviceEditor?.id ? 'Edit Service' : 'Add Service'} open={Boolean(serviceEditor)} onClose={() => setServiceEditor(null)}>
        <div className="space-y-4">
          <label className="forge-label">Name</label><input className="forge-input" value={serviceForm.name ?? ''} onChange={e => setServiceForm((c: any) => ({ ...c, name: e.target.value, slug: slugify(e.target.value) }))} />
          <label className="forge-label">Slug</label><input className="forge-input" value={serviceForm.slug ?? ''} onChange={e => setServiceForm((c: any) => ({ ...c, slug: e.target.value }))} />
          <label className="forge-label">Description</label><textarea className="forge-input min-h-[100px]" value={serviceForm.description ?? ''} onChange={e => setServiceForm((c: any) => ({ ...c, description: e.target.value }))} />
          <div className="grid grid-cols-2 gap-4"><div><label className="forge-label">Duration</label><input className="forge-input" type="number" value={serviceForm.duration_minutes ?? 60} onChange={e => setServiceForm((c: any) => ({ ...c, duration_minutes: e.target.value }))} /></div><div><label className="forge-label">Price ($)</label><input className="forge-input" type="number" step="0.01" value={serviceForm.price_dollars ?? '0.00'} onChange={e => setServiceForm((c: any) => ({ ...c, price_dollars: e.target.value }))} /></div></div>
          <div className="grid grid-cols-2 gap-4"><div><label className="forge-label">Category</label><select className="forge-input" value={serviceForm.category ?? 'assessment'} onChange={e => setServiceForm((c: any) => ({ ...c, category: e.target.value }))}>{SERVICE_CATEGORIES.map(option => <option key={option} value={option}>{stageLabel(option)}</option>)}</select></div><div><label className="forge-label">Service Type</label><select className="forge-input" value={serviceForm.service_type ?? 'single'} onChange={e => setServiceForm((c: any) => ({ ...c, service_type: e.target.value }))}>{SERVICE_TYPES.map(option => <option key={option} value={option}>{stageLabel(option)}</option>)}</select></div></div>
          <div><label className="forge-label">Booking Section</label><select className="forge-input" value={serviceForm.section ?? ''} onChange={e => setServiceForm((c: any) => ({ ...c, section: e.target.value || null }))}><option value="">Unassigned</option>{SERVICE_SECTIONS.map(option => <option key={option.id} value={option.id}>{option.title}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-4"><div><label className="forge-label">Booking Type</label><select className="forge-input" value={serviceForm.booking_type ?? 'scheduled'} onChange={e => setServiceForm((c: any) => ({ ...c, booking_type: e.target.value }))}>{BOOKING_TYPES.map(option => <option key={option} value={option}>{stageLabel(option)}</option>)}</select></div><div><label className="forge-label">Forge Stage</label><select className="forge-input" value={serviceForm.forge_stage ?? ''} onChange={e => setServiceForm((c: any) => ({ ...c, forge_stage: e.target.value }))}><option value="">None</option>{FORGE_STAGE_OPTIONS.map(option => <option key={option} value={option}>{stageLabel(option)}</option>)}</select></div></div>
          <div><label className="forge-label">Required Forms</label><div className="grid grid-cols-2 gap-2 rounded-xl border border-forge-border/70 bg-forge-surface-3/60 p-4">{REQUIRED_FORM_TYPES.map(option => <label key={option} className="flex items-center gap-2 text-sm text-forge-text-primary/65"><input type="checkbox" checked={(serviceForm.required_forms ?? []).includes(option)} onChange={() => setServiceForm((c: any) => ({ ...c, required_forms: (c.required_forms ?? []).includes(option) ? c.required_forms.filter((item: string) => item !== option) : [...(c.required_forms ?? []), option] }))} />{stageLabel(option)}</label>)}</div></div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2"><div className="flex items-center justify-between rounded-xl border border-forge-border/70 bg-forge-surface-3/60 px-4 py-3"><span className="text-sm text-forge-text-primary/65">Is Public</span><Toggle checked={Boolean(serviceForm.is_public)} onChange={next => setServiceForm((c: any) => ({ ...c, is_public: next }))} /></div><div><label className="forge-label">Sort Order</label><input className="forge-input" type="number" value={serviceForm.sort_order ?? 0} onChange={e => setServiceForm((c: any) => ({ ...c, sort_order: e.target.value }))} /></div></div>
          <button onClick={() => void save('services')} disabled={saving} className="forge-btn-gold w-full disabled:opacity-50">{saving ? 'Saving...' : 'Save Service'}</button>
        </div>
      </SlideOver>

      <SlideOver title={packageEditor?.id ? 'Edit Package' : 'Add Package'} open={Boolean(packageEditor)} onClose={() => setPackageEditor(null)}>
        <div className="space-y-4">
          <label className="forge-label">Name</label><input className="forge-input" value={packageForm.name ?? ''} onChange={e => setPackageForm((c: any) => ({ ...c, name: e.target.value, slug: slugify(e.target.value) }))} />
          <label className="forge-label">Slug</label><input className="forge-input" value={packageForm.slug ?? ''} onChange={e => setPackageForm((c: any) => ({ ...c, slug: e.target.value }))} />
          <label className="forge-label">Description</label><textarea className="forge-input min-h-[100px]" value={packageForm.description ?? ''} onChange={e => setPackageForm((c: any) => ({ ...c, description: e.target.value }))} />
          <div className="grid grid-cols-2 gap-4"><div><label className="forge-label">Session Count</label><input className="forge-input" type="number" value={packageForm.session_count ?? 4} onChange={e => setPackageForm((c: any) => ({ ...c, session_count: e.target.value }))} /></div><div><label className="forge-label">Duration (min)</label><input className="forge-input" type="number" value={packageForm.duration_minutes ?? 60} onChange={e => setPackageForm((c: any) => ({ ...c, duration_minutes: e.target.value }))} /></div></div>
          <div className="grid grid-cols-2 gap-4"><div><label className="forge-label">Price ($)</label><input className="forge-input" type="number" step="0.01" value={packageForm.price_dollars ?? '0.00'} onChange={e => setPackageForm((c: any) => ({ ...c, price_dollars: e.target.value }))} /></div><div><label className="forge-label">Billing Type</label><select className="forge-input" value={packageForm.billing_type ?? 'monthly'} onChange={e => setPackageForm((c: any) => ({ ...c, billing_type: e.target.value }))}>{BILLING_TYPES.map(option => <option key={option} value={option}>{option.toUpperCase()}</option>)}</select></div></div>
          <div className="grid grid-cols-2 gap-4"><div><label className="forge-label">Billing Period</label><input className="forge-input" type="number" value={packageForm.billing_period_months ?? 1} onChange={e => setPackageForm((c: any) => ({ ...c, billing_period_months: e.target.value }))} /></div><div><label className="forge-label">Forge Stage</label><select className="forge-input" value={packageForm.forge_stage ?? 'foundations'} onChange={e => setPackageForm((c: any) => ({ ...c, forge_stage: e.target.value }))}>{FORGE_STAGE_OPTIONS.map(option => <option key={option} value={option}>{stageLabel(option)}</option>)}</select></div></div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2"><div className="flex items-center justify-between rounded-xl border border-forge-border/70 bg-forge-surface-3/60 px-4 py-3"><span className="text-sm text-forge-text-primary/65">Is Public</span><Toggle checked={Boolean(packageForm.is_public)} onChange={next => setPackageForm((c: any) => ({ ...c, is_public: next }))} /></div><div><label className="forge-label">Sort Order</label><input className="forge-input" type="number" value={packageForm.sort_order ?? 0} onChange={e => setPackageForm((c: any) => ({ ...c, sort_order: e.target.value }))} /></div></div>
          <div>
            <label className="forge-label">Included Bookable Sessions</label>
            <div className="space-y-3 rounded-xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
              <p className="text-xs text-forge-text-muted">Attach specific services to this package so booking can reflect the monthly session allotment.</p>
              {services.length > 0 ? services.map((service) => {
                const includedServices = normalizeIncludedServices(packageForm.included_services)
                const selectedService = includedServices.find((item) => item.service_id === service.id)
                return (
                  <div key={service.id} className="rounded-xl border border-forge-border/70 bg-forge-surface-3/60 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <label className="flex items-start gap-3 text-sm text-forge-text-primary/75">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedService)}
                          onChange={(event) => setPackageForm((current: any) => {
                            const nextIncludedServices = normalizeIncludedServices(current.included_services)
                            if (event.target.checked) {
                              return {
                                ...current,
                                included_services: [...nextIncludedServices, {
                                  service_id: service.id,
                                  monthly_session_allotment: 1,
                                  service_name: service.name,
                                }],
                              }
                            }
                            return {
                              ...current,
                              included_services: nextIncludedServices.filter((item) => item.service_id !== service.id),
                            }
                          })}
                        />
                        <span>
                          <span className="block font-medium text-forge-text-primary">{service.name}</span>
                          <span className="mt-1 block text-xs text-forge-text-muted">{formatDurationLabel(service.duration_minutes)} - {stageLabel(service.category)}</span>
                        </span>
                      </label>
                      {selectedService ? (
                        <div className="w-28">
                          <label className="mb-1 block text-[11px] uppercase tracking-wide text-forge-text-muted">Per Month</label>
                          <input
                            className="forge-input h-10"
                            type="number"
                            min={1}
                            value={selectedService.monthly_session_allotment}
                            onChange={(event) => setPackageForm((current: any) => ({
                              ...current,
                              included_services: normalizeIncludedServices(current.included_services).map((item) => item.service_id === service.id ? {
                                ...item,
                                monthly_session_allotment: Math.max(1, Number(event.target.value || 1)),
                              } : item),
                            }))}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              }) : <div className="text-sm text-forge-text-muted">Create at least one bookable service first.</div>}
            </div>
          </div>
          <button onClick={() => void save('packages')} disabled={saving} className="forge-btn-gold w-full disabled:opacity-50">{saving ? 'Saving...' : 'Save Package'}</button>
        </div>
      </SlideOver>

      <SlideOver title="Edit Form Template" open={Boolean(templateEditor)} onClose={() => setTemplateEditor(null)}>
        <div className="space-y-4">
          <label className="forge-label">Name</label><input className="forge-input" value={templateForm.name ?? ''} onChange={e => setTemplateForm((c: any) => ({ ...c, name: e.target.value }))} />
          <label className="forge-label">Description</label><textarea className="forge-input min-h-[100px]" value={templateForm.description ?? ''} onChange={e => setTemplateForm((c: any) => ({ ...c, description: e.target.value }))} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2"><div className="flex items-center justify-between rounded-xl border border-forge-border/70 bg-forge-surface-3/60 px-4 py-3"><span className="text-sm text-forge-text-primary/65">Requires Signature</span><Toggle checked={Boolean(templateForm.requires_signature)} onChange={next => setTemplateForm((c: any) => ({ ...c, requires_signature: next }))} /></div><div className="flex items-center justify-between rounded-xl border border-forge-border/70 bg-forge-surface-3/60 px-4 py-3"><span className="text-sm text-forge-text-primary/65">Is Active</span><Toggle checked={Boolean(templateForm.is_active)} onChange={next => setTemplateForm((c: any) => ({ ...c, is_active: next }))} /></div></div>
          <label className="forge-label">Validity Days</label><input className="forge-input" type="number" value={templateForm.validity_days ?? ''} onChange={e => setTemplateForm((c: any) => ({ ...c, validity_days: e.target.value }))} />
          <label className="forge-label">Fields JSON</label><pre className="overflow-x-auto rounded-xl border border-forge-border/70 bg-forge-surface-3/60 p-4 text-xs text-forge-text-secondary">{templateForm.fields ?? '[]'}</pre>
          <button onClick={() => void save('forms')} disabled={saving} className="forge-btn-gold w-full disabled:opacity-50">{saving ? 'Saving...' : 'Save Template'}</button>
        </div>
      </SlideOver>
      <SlideOver title={templatePreview ? `Preview: ${templatePreview.name}` : 'Preview Form'} open={Boolean(templatePreview)} onClose={() => setTemplatePreview(null)}>
        {templatePreview ? <FormPreview template={templatePreview} /> : null}
      </SlideOver>
    </div>
  )
}
















