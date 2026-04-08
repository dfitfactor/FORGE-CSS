'use client'

import { useEffect, useState } from 'react'
import { Crown, Loader2, UserCog } from 'lucide-react'

type TeamUser = {
  id: string
  full_name: string
  email: string
  role: 'admin' | 'coach' | 'client'
  access_level: 'admin' | 'regular'
  is_superuser: boolean
  is_active: boolean
  last_login_at: string | null
  created_at: string
}

type AccessLevelOption = 'admin' | 'regular'

type Props = {
  canManage: boolean
  currentUserId: string
}

function formatDateTime(value: string | null) {
  if (!value) return 'Never'

  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function TeamAccessCard({ canManage, currentUserId }: Props) {
  const [users, setUsers] = useState<TeamUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [savingUserId, setSavingUserId] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadUsers() {
      setLoading(true)
      setError('')

      try {
        const res = await fetch('/api/settings/team', { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))

        if (!res.ok) {
          throw new Error(data.error ?? 'Failed to load team access')
        }

        if (!active) return
        setUsers(Array.isArray(data.users) ? (data.users as TeamUser[]) : [])
      } catch (err: unknown) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Failed to load team access')
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    if (canManage) {
      void loadUsers()
    } else {
      setLoading(false)
    }

    return () => {
      active = false
    }
  }, [canManage])

  async function updateRole(userId: string, accessLevel: AccessLevelOption) {
    setSavingUserId(userId)
    setError('')
    setSuccess('')

    try {
      const res = await fetch('/api/settings/team', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: accessLevel }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to update access')
      }

      const updatedUser = data.user as TeamUser | undefined
      if (updatedUser) {
        setUsers((current) =>
          current
            .map((user) => (user.id === updatedUser.id ? updatedUser : user))
            .sort((a, b) => {
              const aRank = a.access_level === 'admin' ? 0 : 1
              const bRank = b.access_level === 'admin' ? 0 : 1
              if (aRank !== bRank) return aRank - bRank
              return a.full_name.localeCompare(b.full_name)
            })
        )
      }

      setSuccess('Team access updated')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update access')
    } finally {
      setSavingUserId(null)
    }
  }

  return (
    <section className="rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-5 space-y-5">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl border border-forge-gold/20 bg-forge-gold/10 p-3 text-forge-gold">
          <UserCog className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-forge-text-muted">Team Access</p>
          <h2 className="mt-2 text-sm font-semibold text-forge-text-primary">Internal Role Access</h2>
          <p className="mt-2 text-sm text-forge-text-secondary">
            Coach Dee at coach@dfitfactor.com is the only superuser during build-out. Everyone else stays on user access until subscription roles are introduced.
          </p>
        </div>
      </div>

      {!canManage ? (
        <div className="rounded-xl border border-forge-border/70 bg-forge-surface-3/60 px-4 py-3 text-sm text-forge-text-secondary">
          Only the Coach Dee superuser account can manage team access.
        </div>
      ) : null}

      {canManage && error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
      ) : null}

      {canManage && success ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">{success}</div>
      ) : null}

      {canManage && loading ? (
        <div className="rounded-xl border border-forge-border/70 bg-forge-surface-3/60 p-8 text-center text-forge-text-muted">
          <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />
          Loading team access...
        </div>
      ) : null}

      {canManage && !loading ? (
        <div className="space-y-3">
          {users.length === 0 ? (
            <div className="rounded-xl border border-dashed border-forge-border bg-forge-surface-3/60 p-8 text-center text-sm text-forge-text-secondary">
              No internal users found yet.
            </div>
          ) : null}

          {users.map((user) => {
            const isSaving = savingUserId === user.id
            const isSuperuser = user.is_superuser
            const selectedRole = isSuperuser ? 'admin' : 'regular'

            return (
              <div key={user.id} className="rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-forge-text-primary">{user.full_name}</p>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                          isSuperuser
                            ? 'border-forge-gold/30 bg-forge-gold/10 text-forge-gold'
                            : 'border-forge-border bg-forge-surface-2 text-forge-text-muted'
                        }`}
                      >
                        {isSuperuser ? 'Admin' : 'User'}
                      </span>
                      {user.id === currentUserId ? (
                        <span className="rounded-full border border-forge-purple/30 bg-forge-purple/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-forge-text-primary">
                          You
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-forge-text-secondary">{user.email}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-forge-text-muted">
                      <span>Joined {formatDateTime(user.created_at)}</span>
                      <span>Last login {formatDateTime(user.last_login_at)}</span>
                    </div>
                  </div>

                  <div className="flex min-w-[220px] flex-col gap-2">
                    <label className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">
                      Role
                    </label>
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedRole}
                        onChange={(event) => void updateRole(user.id, event.target.value as AccessLevelOption)}
                        disabled={isSaving}
                        className="forge-input h-11 min-w-0 flex-1 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <option value="admin">Admin</option>
                        <option value="regular">User</option>
                      </select>
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin text-forge-text-muted" /> : null}
                    </div>
                    {isSuperuser ? (
                      <p className="inline-flex items-center gap-2 text-xs text-forge-gold">
                        <Crown className="h-3.5 w-3.5" />
                        Reserved for Coach Dee
                      </p>
                    ) : (
                      <p className="text-xs text-forge-text-muted">
                        Admin remains reserved for coach@dfitfactor.com during build-out.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
