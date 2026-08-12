'use client'
import { useState } from 'react'
import type { Agent } from '@/lib/kymera'

export function HireReview({ agent, benchmarkId }: { agent: Agent; benchmarkId?: string }) {
  const [open, setOpen] = useState(false)
  const [task, setTask] = useState('Monitor yield opportunities and summarize risks.')
  const [hire, setHire] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  async function create() {
    setBusy(true)
    try { const response = await fetch('/api/hires', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agentId: agent.id, userAddress: '0xDemoWallet', task, benchmarkId }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error); setHire(payload.hire) } finally { setBusy(false) }
  }
  async function verify() { if (!hire) return; setBusy(true); try { const response = await fetch(`/api/hires/${hire.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userAddress: '0xDemoWallet' }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error); setHire(payload.hire) } finally { setBusy(false) } }
  return <><button onClick={() => setOpen(true)} className="rounded-xl bg-[#e95d25] px-4 py-3 text-sm font-semibold text-white">Hire agent</button>{open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"><div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl border border-[#e9e7e2] bg-white p-6 shadow-xl"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#e95d25]">Kymera Hire</p><h2 className="mt-2 text-2xl font-semibold">Review {agent.name}</h2></div><button onClick={() => setOpen(false)} className="text-sm text-[#77736c]">Close</button></div><p className="mt-3 text-sm leading-6 text-[#77736c]">Simulation payment only. No wallet signing or blockchain execution occurs.</p><label className="mt-6 block text-sm font-medium">Task<textarea value={task} onChange={(event) => setTask(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-[#e2ded8] bg-[#fafaf9] p-3 text-sm" /></label><div className="mt-5 grid gap-2 text-sm"><p><span className="font-medium">Permissions:</span> read market data, analyze positions</p><p><span className="font-medium">Blocked:</span> move funds, submit transactions</p><p><span className="font-medium">Payment:</span> {hire?.paymentStatus || 'Pending demo verification'}</p></div>{hire?.status === 'ACTIVE' ? <div className="mt-6 rounded-xl bg-[#eef8ef] p-4 text-sm text-[#32653a]">Hire active. Guard session {hire.sessionId} is simulation-only.</div> : <button disabled={busy || !task.trim()} onClick={hire ? verify : create} className="mt-6 w-full rounded-xl bg-[#171717] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Processing…' : hire ? 'Verify demo payment' : 'Create hire and review payment'}</button>}</div></div>}</>
}
