'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Compass, Loader2 } from 'lucide-react'
import {
  ActivityItem, AlertList, Empty, PageHeader, RequireWallet, StatTile,
  type Summary,
} from '@/components/product/shared'

/**
 * The control centre. Answers, at a glance: what have I hired, what can it do right
 * now, what has it done, and is anything wrong.
 */
export function ControlCentre() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">
      <PageHeader
        eyebrow="Control centre"
        title="Your agents, and what they're allowed to do."
        description="Everything here is scoped to your wallet and derived from real records — hires you made, sessions you granted, and every decision Guard took."
        action={
          <Link href="/discover" className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
            <Compass size={15} aria-hidden /> Discover agents
          </Link>
        }
      />
      <div className="mt-10">
        <RequireWallet title="Your dashboard"><Body /></RequireWallet>
      </div>
    </div>
  )
}

function Body() {
  const [data, setData] = useState<Summary | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/dashboard/summary', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Could not load your workspace')
        setData(payload); setError('')
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load your workspace'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" aria-hidden /> Loading your workspace…</p>
  if (error) return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
  if (!data) return null

  const activeAgents = data.agents.filter((agent) => agent.status === 'ACTIVE')

  return (
    <div className="flex flex-col gap-8">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label="My agents" value={data.stats.agents} hint="Active hires" />
        <StatTile label="Live sessions" value={data.stats.sessions} hint="Unexpired permission grants" />
        <StatTile label="Authorized" value={data.stats.approved} hint="Actions Guard allowed" />
        <StatTile label="Blocked" value={data.stats.blocked} hint="Actions Guard refused" tone={data.stats.blocked > 0 ? 'bad' : undefined} />
        <StatTile label="Confirmed on-chain" value={data.stats.confirmed} hint="Transactions mined" tone="good" />
      </section>

      <section>
        <h2 className="text-lg font-semibold">Needs your attention</h2>
        <p className="mt-1 text-sm text-muted-foreground">Blocks, expiries, and limits approaching their cap.</p>
        <div className="mt-4"><AlertList alerts={data.alerts} /></div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">My agents</h2>
            <Link href="/agents" className="text-sm font-semibold text-primary">Manage</Link>
          </div>
          <div className="mt-4">
            {activeAgents.length ? (
              <div className="flex flex-col gap-2.5">
                {activeAgents.slice(0, 4).map((agent) => (
                  <Link key={agent.hireId} href={`/agents/${agent.agentId}/workspace`} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 hover:border-[#d7d2cb]">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{agent.name}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{agent.task}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-xs text-muted-foreground">{agent.score === null ? 'Unscored' : `${agent.score}/100`}</span>
                      <ArrowRight size={15} className="text-muted-foreground" aria-hidden />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <Empty
                title="No agents hired yet"
                body="Find an agent in the marketplace and hire it to get started."
                action={<Link href="/discover" className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Browse agents</Link>}
              />
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Recent activity</h2>
            <Link href="/activity" className="text-sm font-semibold text-primary">View all</Link>
          </div>
          <div className="mt-4">
            {data.activity.length ? (
              <div className="flex flex-col gap-2.5">
                {data.activity.slice(0, 4).map((row) => <ActivityItem key={row.id} row={row} />)}
              </div>
            ) : (
              <Empty title="No activity yet" body="Once an agent requests an action, every Guard decision appears here." />
            )}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-muted/40 p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Security posture</p>
        <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div className="flex gap-2"><dt className="text-muted-foreground">Networks</dt><dd className="font-medium">{data.posture.network}</dd></div>
          <div className="flex gap-2"><dt className="text-muted-foreground">Custody</dt><dd className="font-medium">{data.posture.custody}</dd></div>
          <div className="flex gap-2"><dt className="text-muted-foreground">Guard</dt><dd className="font-medium">enforced on every action</dd></div>
        </dl>
      </section>
    </div>
  )
}
