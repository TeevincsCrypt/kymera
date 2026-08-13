'use client'
import { useEffect, useState } from 'react'

type Status = { available: boolean; mode: string; network: string; walletConfigured: boolean; reason?: string; guard: string }
export function AltanaStatusPanel() {
  const [status, setStatus] = useState<Status | null>(null)
  useEffect(() => { fetch('/api/altana/status').then((response) => response.json()).then(setStatus).catch(() => setStatus(null)) }, [])
  const unavailable = status && !status.available
  return <section className="rounded-2xl border border-[#e9e7e2] bg-white p-5 shadow-[0_12px_35px_rgba(36,33,31,.04)]"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#e95d25]">Authorization layer</p><h2 className="mt-2 text-xl font-semibold tracking-[-.03em]">Altana Authorization</h2></div><span className="rounded-full bg-[#f4f2ee] px-3 py-1 text-xs font-medium text-[#5d5953]">Guard Enabled</span></div><div className="mt-5 grid gap-3 sm:grid-cols-4">{[['Mode', status?.mode || 'Loading'], ['Status', status ? (status.available ? 'Available' : 'Unavailable') : 'Loading'], ['Wallet', status?.walletConfigured ? 'Connected' : 'Not configured'], ['Network', status?.network || '—']].map(([label, value]) => <div key={label} className="rounded-xl bg-[#faf9f7] p-3"><p className="text-xs text-[#8a857d]">{label}</p><p className="mt-1 text-sm font-semibold text-[#24211f]">{value}</p></div>)}</div>{unavailable && status?.reason === 'ALTANA_PRIVATE_KEY_NOT_CONFIGURED' && <p className="mt-4 rounded-xl border border-[#f1d5c8] bg-[#fff7f2] px-4 py-3 text-sm text-[#9d4925]">Testnet signing unavailable — configure a dedicated server-side Altana admin wallet.</p>}<p className="mt-4 text-xs leading-5 text-[#77736c]">Simulation results are labeled and never represent confirmed onchain transactions. Passkey wallet creation remains architecture-ready but is not enabled in this browser flow.</p></section>
}
