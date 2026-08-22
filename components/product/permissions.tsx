'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Ban, Loader2, ShieldCheck } from 'lucide-react'
import { Empty, PageHeader, RequireWallet, type SessionRow, type Summary } from '@/components/product/shared'

const PERMISSION_COPY: Record<string, string> = {
  read_market_data: 'Read market data',
  analyze_positions: 'Analyze positions',
  execute_trades: 'Request swaps',
  submit_transactions: 'Submit agent jobs',
  move_funds: 'Move funds (never granted)',
}

/** Where boundaries are reviewed and revoked. Revoking is the emergency stop. */
export function PermissionsPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-10 md:px-8 md:py-14">
      <PageHeader
        eyebrow="Permissions"
        title="What each agent is allowed to do."
        description="A session is an agent's entire authority. Revoke it and every future request is refused immediately, including any already authorized but unsigned."
      />
      <div className="mt-10"><RequireWallet title="Permissions"><Body /></RequireWallet></div>
    </div>
  )
}

function Body() {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revoking, setRevoking] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/dashboard/summary', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json() as Summary & { error?: string }
        if (!response.ok) throw new Error(payload.error || 'Could not load permissions')
        setSessions(payload.sessions)
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load permissions'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function revoke(id: string) {
    setRevoking(id)
    try {
      const response = await fetch(`/api/sessions/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        setError(payload.error || 'Could not revoke that session.')
        return
      }
      setSessions((current) => current.map((session) => (session.id === id ? { ...session, status: 'Revoked' } : session)))
    } finally {
      setRevoking(null)
    }
  }

  if (loading) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" aria-hidden /> Loading permissions…</p>

  const now = Date.now()
  const live = sessions.filter((session) => session.status === 'Active' && new Date(session.expiresAt).getTime() > now)
  const past = sessions.filter((session) => !live.includes(session))

  return (
    <div className="flex flex-col gap-10">
      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>}

      <section>
        <h2 className="text-lg font-semibold">Active grants</h2>
        <p className="mt-1 text-sm text-muted-foreground">These agents can request actions right now, within these limits.</p>
        <div className="mt-4">
          {live.length ? (
            <div className="flex flex-col gap-3">
              {live.map((session) => (
                <SessionCard key={session.id} session={session} onRevoke={revoke} revoking={revoking === session.id} />
              ))}
            </div>
          ) : (
            <Empty
              title="No active permissions"
              body="No agent can request anything on-chain right now. Grant a session from an agent's profile to let one act within limits you set."
              action={<Link href="/agents" className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Go to my agents</Link>}
            />
          )}
        </div>
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold">Ended</h2>
          <p className="mt-1 text-sm text-muted-foreground">Expired or revoked. These agents can no longer request anything.</p>
          <div className="mt-4 flex flex-col gap-3">
            {past.map((session) => <SessionCard key={session.id} session={session} />)}
          </div>
        </section>
      )}
    </div>
  )
}

function SessionCard({ session, onRevoke, revoking }: { session: SessionRow; onRevoke?: (id: string) => void; revoking?: boolean }) {
  const active = Boolean(onRevoke)
  return (
    <article className={`rounded-2xl border p-5 ${active ? 'border-border bg-card' : 'border-border bg-muted/30'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">{session.agentName}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {active ? `Expires ${new Date(session.expiresAt).toLocaleString()}` : `Ended ${new Date(session.expiresAt).toLocaleDateString()}`}
            {' · '}chain {session.chainId}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${active ? 'bg-[#e8f6f0] text-[#138a61]' : 'bg-muted text-muted-foreground'}`}>
          {session.status}
        </span>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-muted/50 p-3">
          <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Spending limit</dt>
          <dd className="mt-1 text-sm font-semibold tabular-nums">
            {session.spendingLimit ?? 'None — value-bearing actions refused'}
          </dd>
        </div>
        <div className="rounded-xl bg-muted/50 p-3">
          <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Granted</dt>
          <dd className="mt-1 text-sm font-semibold">{new Date(session.createdAt).toLocaleDateString()}</dd>
        </div>
      </dl>

      <div className="mt-4">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Allowed actions</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {session.permissions.length ? session.permissions.map((permission) => (
            <span key={permission} className="rounded-md bg-secondary px-2 py-1 text-[11px] font-medium text-secondary-foreground">
              {PERMISSION_COPY[permission] ?? permission}
            </span>
          )) : <span className="text-xs text-muted-foreground">None</span>}
        </div>
      </div>

      <p className="mt-4 flex items-start gap-2 text-[11px] leading-5 text-muted-foreground">
        <ShieldCheck size={13} className="mt-0.5 shrink-0" aria-hidden />
        Moving funds out of your wallet can never be granted, and you sign every transaction yourself.
      </p>

      {onRevoke && (
        <button
          type="button"
          onClick={() => onRevoke(session.id)}
          disabled={revoking}
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-destructive/40 px-4 py-2.5 text-sm font-semibold text-destructive disabled:opacity-50"
        >
          {revoking ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Ban size={14} aria-hidden />}
          {revoking ? 'Revoking…' : 'Revoke access'}
        </button>
      )}
    </article>
  )
}
