'use client'

import { useEffect, useState } from 'react'

const links = [
  ['Discover agents', '/discover'],
  ['Compare in Arena', '/arena'],
  ['PancakeSwap data', '/pancakeswap'],
  ['Session console', '#sessions'],
]

export function DashboardControlPlane() {
  const [stats, setStats] = useState<{ agents: number; evaluated: number; hires: number; sessions: number; executions: number; blocked: number } | null>(null)
  const [security, setSecurity] = useState<{ simulation: boolean; altana: boolean; score: boolean; persistence: boolean } | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetch('/api/dashboard/stats?userAddress=0xDemoWallet').then((response) => response.json()).then((payload) => { setStats(payload.stats); setSecurity(payload.security) }).catch(() => setMessage('Dashboard metrics unavailable'))
  }, [])

  async function resetDemo() {
    setMessage('Demo reset is isolated and non-destructive. Existing production data is never deleted.')
  }

  return <section className="rounded-2xl border border-[#e9e7e2] bg-[#24211f] p-5 text-[#fffaf5] shadow-[0_18px_42px_rgba(36,33,31,0.12)]"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ffb38f]">Kymera control plane</p><h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">From discovery to receipt</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#d6d0ca]">One demo surface for agent selection, Arena comparison, hire intent, Guard configuration, execution preview, and persistent audit history.</p></div><button onClick={resetDemo} className="rounded-lg border border-[#655e58] px-3 py-2 text-xs font-medium text-[#fffaf5] hover:border-[#ffb38f]">Reset demo</button></div><div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">{[['Agents', stats?.agents ?? '—'], ['Evaluated', stats?.evaluated ?? '—'], ['Active hires', stats?.hires ?? '—'], ['Guard sessions', stats?.sessions ?? '—'], ['Executions', stats?.executions ?? '—'], ['Blocked', stats?.blocked ?? '—']].map(([label, value]) => <div key={label} className="rounded-xl border border-[#403b37] bg-[#2e2a27] p-3"><p className="text-[10px] uppercase tracking-[0.15em] text-[#a9a19a]">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>)}</div><div className="mt-5 grid gap-2 md:grid-cols-2"><div className="rounded-xl border border-[#403b37] bg-[#2e2a27] p-4"><p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#ffb38f]">Runbook</p><div className="mt-3 flex flex-wrap gap-2">{links.map(([label, href]) => <a key={href} href={href} className="rounded-lg bg-[#fffaf5] px-3 py-2 text-xs font-medium text-[#24211f] hover:bg-[#ffb38f]">{label}</a>)}</div></div><div className="rounded-xl border border-[#403b37] bg-[#2e2a27] p-4"><p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#ffb38f]">Security state</p><div className="mt-3 grid gap-2 text-xs text-[#d6d0ca]">{security ? Object.entries({ Simulation: security.simulation, 'Altana connected': security.altana, 'Kymera Score': security.score, 'Neon persistence': security.persistence }).map(([label, value]) => <div key={label} className="flex items-center justify-between"><span>{label}</span><span className={value ? 'text-[#8fe0ad]' : 'text-[#ffb38f]'}>{value ? 'Ready' : 'Unavailable'}</span></div>) : <span>Loading checks…</span>}</div></div></div>{message && <p className="mt-3 text-xs text-[#ffb38f]">{message}</p>}</section>
}
