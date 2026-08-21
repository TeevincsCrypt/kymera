'use client'

import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'

type Permission = { permission: string; allowed: boolean }
type Session = {
  id: string
  agentId: string
  status: string
  mode: string
  chainId: number
  spendingLimit: string | number | null
  expiresAt: string
  createdAt: string
  agent?: { name?: string } | null
  permissions?: Permission[]
}

export function SessionConsole() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/sessions', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Could not load sessions')
        setSessions(payload.sessions || [])
        setError('')
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load sessions'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function revoke(id: string) {
    const response = await fetch(`/api/sessions/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    if (response.ok) setSessions((current) => current.map((session) => (session.id === id ? { ...session, status: 'Revoked' } : session)))
    else setError('Could not revoke that session.')
  }

  if (loading) return <div className="rounded-xl border border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">Loading Guard sessions…</div>
  if (error) return <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-6 text-center text-sm text-destructive">{error}</div>

  if (!sessions.length) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-5 py-10 text-center">
        <ShieldCheck className="mx-auto text-primary" size={22} aria-hidden />
        <p className="mt-3 text-sm font-medium">No Guard sessions yet</p>
        <p className="mt-1 text-sm text-muted-foreground">Grant one from an agent profile to define what it may do on-chain.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {sessions.map((session) => {
        const granted = (session.permissions || []).filter((item) => item.allowed).map((item) => item.permission)
        return (
          <div key={session.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{session.agent?.name || session.agentId}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Limit {session.spendingLimit ?? 'none'} · chain {session.chainId} · {session.status === 'Active' ? `expires ${new Date(session.expiresAt).toLocaleString()}` : `ended ${new Date(session.expiresAt).toLocaleDateString()}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${session.status === 'Active' ? 'bg-[#e8f6f0] text-[#138a61]' : 'bg-muted text-muted-foreground'}`}>{session.status}</span>
                {session.status === 'Active' && (
                  <button type="button" className="text-xs font-semibold text-destructive hover:underline" onClick={() => revoke(session.id)}>Revoke</button>
                )}
              </div>
            </div>
            {granted.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {granted.map((permission) => (
                  <span key={permission} className="rounded-md bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground">{permission}</span>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
