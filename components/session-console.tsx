'use client'

import { useEffect, useState } from 'react'

type Session = { id: string; agentId: string; userAddress: string; status: string; mode: string; spendingLimit: string | number | null; expiresAt: string; createdAt: string; agent?: { name: string } }

export function SessionConsole({ userAddress }: { userAddress?: string }) {
  const [sessions, setSessions] = useState<Session[]>([])
  useEffect(() => { fetch(`/api/sessions${userAddress ? `?userAddress=${encodeURIComponent(userAddress)}` : ''}`).then((response) => response.json()).then((payload) => setSessions(payload.sessions || [])).catch(() => setSessions([])) }, [userAddress])
  async function revoke(id: string) { await fetch(`/api/sessions/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userAddress: userAddress || 'dashboard' }) }); setSessions((current) => current.map((session) => session.id === id ? { ...session, status: 'Revoked' } : session)) }
  return <div className="flex flex-col gap-3">{sessions.length ? sessions.map((session) => <div key={session.id} className="flex items-center justify-between gap-4 rounded-xl border border-[#e7e2dc] bg-white p-4"><div><p className="text-sm font-semibold text-[#24211f]">{session.agent?.name || session.agentId}</p><p className="mt-1 text-xs text-[#77736c]">{session.mode} · limit {session.spendingLimit ?? 'none'} · expires {new Date(session.expiresAt).toLocaleDateString()}</p></div><div className="flex items-center gap-3"><span className="rounded-full bg-[#f3f1ed] px-2 py-1 text-[11px] text-[#6d6962]">{session.status}</span>{session.status === 'Active' && <button className="text-xs font-semibold text-[#b84b1f]" onClick={() => revoke(session.id)}>Revoke</button>}</div></div>) : <div className="rounded-xl border border-dashed border-[#d9d4cd] bg-white px-5 py-8 text-center text-sm text-[#77736c]">No Guard sessions yet.</div>}</div>
}
