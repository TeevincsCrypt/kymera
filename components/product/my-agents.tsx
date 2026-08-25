'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowRight, Compass, Loader2 } from 'lucide-react'
import { Empty, PageHeader, RequireWallet, explorerFor, type Summary } from '@/components/product/shared'

/** Every agent this wallet has hired, and the live state of its authority. */
export function MyAgentsPage() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">
      <PageHeader
        eyebrow="My agents"
        title="Agents working for you."
        description="Each card shows what the agent may currently do. An agent with no active session can look, but cannot request anything on-chain."
        action={
          <Link href="/discover" className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
            <Compass size={15} aria-hidden /> Hire another
          </Link>
        }
      />
      <div className="mt-10"><RequireWallet title="My agents"><Body /></RequireWallet></div>
    </div>
  )
}

function Body() {
  const [data, setData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/dashboard/summary', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Could not load your agents')
        setData(payload)
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load your agents'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" aria-hidden /> Loading…</p>
  if (error) return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
  if (!data) return null

  if (!data.agents.length) {
    return (
      <Empty
        title="You haven't hired an agent yet"
        body="Browse the marketplace, compare agents on evidence, and hire the one that fits your task."
        action={<Link href="/discover" className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Browse the marketplace</Link>}
      />
    )
  }

  const now = Date.now()

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {data.agents.map((agent) => {
        const session = data.sessions.find((row) => row.id === agent.sessionId)
        const live = session && session.status === 'Active' && new Date(session.expiresAt).getTime() > now
        return (
          <article key={agent.hireId} className="flex flex-col rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-semibold">{agent.name}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{agent.category}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${live ? 'bg-[#e8f6f0] text-[#138a61]' : 'bg-muted text-muted-foreground'}`}>
                {live ? 'Active' : session ? 'Session ended' : 'No session'}
              </span>
            </div>

            <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">{agent.task}</p>

            <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-border py-3 text-sm">
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Kymera Score</dt>
                <dd className="mt-1 font-semibold tabular-nums">{agent.score === null ? 'Unscored' : `${agent.score}/100`}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Spending limit</dt>
                <dd className="mt-1 font-semibold tabular-nums">{session?.spendingLimit ?? 'None'}</dd>
              </div>
            </dl>

            {session && session.permissions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {session.permissions.map((permission) => (
                  <span key={permission} className="rounded-md bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground">{permission}</span>
                ))}
              </div>
            )}

            {agent.paymentTxHash && (
              <a
                href={`${explorerFor(agent.paymentChainId)}/tx/${agent.paymentTxHash}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block break-all text-xs text-primary underline underline-offset-2"
              >
                Hire payment: {agent.paymentTxHash.slice(0, 18)}…
              </a>
            )}

            <div className="mt-5 flex items-center gap-2">
              <Link href={`/agents/${agent.agentId}/workspace`} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
                Open workspace <ArrowRight size={14} aria-hidden />
              </Link>
              <Link href="/permissions" className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium">Permissions</Link>
            </div>
          </article>
        )
      })}
    </div>
  )
}
