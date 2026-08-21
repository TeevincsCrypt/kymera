'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useKymeraSession } from '@/lib/web3/kymera-session'

type Stats = { agents: number; evaluated: number; hires: number; sessions: number; authorized: number; blocked: number; confirmed: number }
type Posture = { guard: string; network: string; allowedChains: number[]; payments: string; custody: string }

const links: Array<[string, string]> = [
  ['Discover agents', '/discover'],
  ['Compare in Arena', '/arena'],
  ['Guard dry-run', '/simulate'],
  ['PancakeSwap data', '/pancakeswap'],
]

export function DashboardControlPlane() {
  const session = useKymeraSession()
  const [stats, setStats] = useState<Stats | null>(null)
  const [posture, setPosture] = useState<Posture | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session.isAuthenticated) { setStats(null); setPosture(null); return }
    fetch('/api/dashboard/stats', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Metrics unavailable')
        setStats(payload.stats); setPosture(payload.posture); setError('')
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Metrics unavailable'))
  }, [session.isAuthenticated])

  if (!session.isAuthenticated) {
    return (
      <section className="rounded-2xl border border-border bg-card p-6">
        <p className="text-sm font-semibold">Sign in to load your workspace</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Kymera verifies wallet ownership with a signature before showing any wallet-scoped data. Nothing here is readable by address alone.
        </p>
      </section>
    )
  }

  const tiles: Array<[string, string | number, string]> = [
    ['Indexed agents', stats?.agents ?? '—', 'Agents in the catalog'],
    ['Evaluated', stats?.evaluated ?? '—', 'Have enough evidence to score'],
    ['Active hires', stats?.hires ?? '—', 'Engagements for your wallet'],
    ['Guard sessions', stats?.sessions ?? '—', 'Active, unexpired permissions'],
    ['Authorized', stats?.authorized ?? '—', 'Actions Guard approved'],
    ['Blocked', stats?.blocked ?? '—', 'Actions Guard refused'],
  ]

  return (
    <section className="rounded-2xl border border-border bg-foreground p-5 text-background">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Control plane</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">From discovery to receipt</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-background/70">
            Agent selection, comparison, permission grants, Guard-enforced execution, and a persistent audit trail — all scoped to your wallet.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        {tiles.map(([label, value, hint]) => (
          <div key={label} className="rounded-xl border border-background/10 bg-background/5 p-3" title={hint}>
            <p className="text-[10px] uppercase tracking-[0.15em] text-background/50">{label}</p>
            <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-2 md:grid-cols-2">
        <div className="rounded-xl border border-background/10 bg-background/5 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-primary">Runbook</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {links.map(([label, href]) => (
              <Link key={href} href={href} className="rounded-lg bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary">{label}</Link>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-background/10 bg-background/5 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-primary">Security posture</p>
          <dl className="mt-3 grid gap-1.5 text-xs text-background/70">
            <Row label="Guard" value={posture?.guard ?? '…'} />
            <Row label="Networks" value={posture?.network ?? '…'} />
            <Row label="Custody" value={posture?.custody ?? '…'} />
            <Row label="Payments" value={posture?.payments ?? '…'} />
          </dl>
        </div>
      </div>

      {error && <p className="mt-3 text-xs text-primary">{error}</p>}
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt>{label}</dt>
      <dd className="font-medium text-background">{value}</dd>
    </div>
  )
}
