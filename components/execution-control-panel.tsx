'use client'

import { useState } from 'react'
import { useWalletConnection } from '@/lib/web3/use-wallet-connection'

const demos = [
  ['approved', 'Approved swap'], ['unauthorizedContract', 'Unauthorized contract'], ['unauthorizedMethod', 'Unauthorized method'], ['spendingLimit', 'Spending limit'], ['expiredSession', 'Expired session'],
] as const

export function ExecutionControlPanel() {
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const { address } = useWalletConnection()
  async function run(demo: string) { if (!address) { setResult({ error: 'Connect your wallet before running an execution check.' }); return } setLoading(true); setResult(null); const response = await fetch('/api/kymera/execute', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userAddress: address, demo, action: { action: 'swap', target: '0xPancakeRouter', method: 'exactInputSingle', value: 5 } }) }); setResult(await response.json()); setLoading(false) }
  return <section className="rounded-2xl border border-[#e9e7e2] bg-white p-5 shadow-[0_12px_32px_rgba(36,33,31,0.04)]"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#e95d25]">Control plane</p><h2 className="mt-2 text-xl font-semibold tracking-[-.03em] text-[#24211f]">Agent execution pipeline</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#77736c]">Every request resolves the agent, reads Kymera Score, evaluates Guard, checks the Altana session, then records a receipt.</p></div><span className="rounded-full bg-[#fff1eb] px-3 py-1 text-xs font-medium text-[#b84b1f]">Simulation-safe</span></div>{!address && <p className="mt-4 text-sm text-[#77736c]">Connect your wallet to run execution checks.</p>}<div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{demos.map(([key, label]) => <button key={key} disabled={loading || !address} onClick={() => run(key)} className="rounded-xl border border-[#e9e7e2] px-3 py-3 text-left text-xs font-medium text-[#5d5953] transition hover:border-[#e95d25] hover:text-[#b84b1f] disabled:opacity-50">{label}</button>)}</div>{result && <div className="mt-5 rounded-xl bg-[#f8f7f4] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold text-[#24211f]">{result.status || 'Request rejected'}</p>{result.receiptId && <code className="text-[11px] text-[#77736c]">{result.receiptId}</code>}</div>{result.error ? <p className="mt-2 text-sm text-[#b84b1f]">{result.error}</p> : <><div className="mt-3 flex flex-wrap gap-2">{(result.pipeline || []).map((stage: string) => <span key={stage} className="rounded-full bg-white px-2 py-1 text-[10px] font-medium text-[#77736c]">{stage}</span>)}</div><p className="mt-3 text-xs leading-5 text-[#77736c]">Decision: {result.decision?.reason || 'No decision returned'} · Kymera Score: {result.score ?? 'n/a'}</p></>}</div>}</section>
}
