'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Row = { id: string; agent?: { id?: string; name?: string }; status?: string; createdAt?: string }

export function RealDashboardPage({ walletAddress }: { walletAddress?: string }) {
  const [hires, setHires] = useState<Row[]>([])
  const [sessions, setSessions] = useState<Row[]>([])
  const [loading, setLoading] = useState(Boolean(walletAddress))

  useEffect(() => {
    if (!walletAddress) { setHires([]); setSessions([]); setLoading(false); return }
    setLoading(true)
    Promise.all([fetch(`/api/hires?userAddress=${encodeURIComponent(walletAddress)}`).then((response) => response.json()), fetch(`/api/sessions?userAddress=${encodeURIComponent(walletAddress)}`).then((response) => response.json())]).then(([hirePayload, sessionPayload]) => {
      setHires(Array.isArray(hirePayload) ? hirePayload : hirePayload.hires || [])
      setSessions(Array.isArray(sessionPayload) ? sessionPayload : sessionPayload.sessions || [])
    }).finally(() => setLoading(false))
  }, [walletAddress])

  const activity = [...hires.map((row) => ({ ...row, kind: 'agent connection' })), ...sessions.map((row) => ({ ...row, kind: 'Guard session' }))].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 8)

  return <main className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14"><p className="text-sm font-medium text-primary">My workspace</p><h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">Your agent desk.</h1><p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">Connected agents, permissions, and recent activity from your wallet-scoped records.</p>{!walletAddress ? <div className="mt-10 rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center"><h2 className="font-semibold">Connect your wallet to load workspace data</h2><p className="mt-2 text-sm text-muted-foreground">No placeholder agents or activity are shown.</p></div> : loading ? <div className="mt-10 rounded-2xl border border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">Loading wallet activity…</div> : <div className="mt-10 grid gap-6 lg:grid-cols-2"><section className="rounded-2xl border border-border bg-card p-6"><div className="flex items-center justify-between"><h2 className="font-semibold">Connected agents</h2><span className="text-xs text-muted-foreground">{hires.length} records</span></div>{hires.length ? <div className="mt-5 flex flex-col gap-3">{hires.map((row) => <div key={row.id} className="flex items-center justify-between rounded-xl border border-border p-4"><div><p className="text-sm font-semibold">{row.agent?.name || 'Indexed agent'}</p><p className="mt-1 text-xs text-muted-foreground">{row.status || 'Connected'}</p></div><Link href={row.agent?.id ? `/agents/${row.agent.id}` : '/discover'} className="text-xs font-semibold text-primary">Open</Link></div>)}</div> : <p className="mt-5 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">No connected agents yet. Connect one from its verified profile.</p>}</section><section className="rounded-2xl border border-border bg-card p-6"><div className="flex items-center justify-between"><h2 className="font-semibold">Recent activity</h2><span className="text-xs text-muted-foreground">{activity.length} records</span></div>{activity.length ? <div className="mt-5 flex flex-col gap-3">{activity.map((row) => <div key={`${row.kind}-${row.id}`} className="flex items-center justify-between border-b border-border pb-3 last:border-0"><div><p className="text-sm font-medium">{row.agent?.name || row.kind}</p><p className="mt-1 text-xs text-muted-foreground">{row.kind} · {row.status || 'created'}</p></div><time className="text-xs text-muted-foreground">{row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '—'}</time></div>)}</div> : <p className="mt-5 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">No activity recorded for this wallet.</p>}</section></div>}</main>
}
