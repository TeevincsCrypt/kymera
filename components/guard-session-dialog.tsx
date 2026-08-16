'use client'

import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import type { Agent } from '@/lib/kymera'

export function GuardSessionDialog({ agent, onCreated }: { agent: Agent; onCreated?: (session: { id: string }) => void }) {
  const [open, setOpen] = useState(false)
  const [durationHours, setDurationHours] = useState(24)
  const [spendingLimit, setSpendingLimit] = useState('100')
  const [userAddress, setUserAddress] = useState('')
  const [permissions, setPermissions] = useState(['read_market_data', 'analyze_positions', 'submit_transactions'])
  const [status, setStatus] = useState('')
  const { address } = useAccount()
  const [walletConnected, setWalletConnected] = useState(false)
  useEffect(() => {
    const syncWallet = () => {
      if (address) { setUserAddress(address); setWalletConnected(true) }
    }
    syncWallet()
    window.addEventListener('kymera:wallet-connected', syncWallet)
    return () => window.removeEventListener('kymera:wallet-connected', syncWallet)
  }, [address])
  const toggle = (permission: string) => setPermissions((current) => current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission])
  async function create() {
    if (!userAddress || !walletConnected) return setStatus('Connect the wallet in the Testnet transaction gate first')
    setStatus('Creating session…')
    const response = await fetch('/api/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agentId: agent.id, userAddress, durationHours, spendingLimit: Number(spendingLimit), permissions }) })
    const payload = await response.json()
    if (!response.ok) return setStatus(payload.error || 'Unable to create session')
    setStatus('Simulation session created')
    onCreated?.(payload.session)
    setTimeout(() => setOpen(false), 900)
  }
  return <>
    <button className="rounded-lg bg-[#f45d22] px-4 py-2 text-sm font-semibold text-white" onClick={() => setOpen(true)}>Hire agent (testnet)</button>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#201d1a]/30 p-4" role="dialog" aria-modal="true" aria-labelledby="guard-title">
      <div className="w-full max-w-lg rounded-2xl border border-[#e7e2dc] bg-[#fffdfa] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#f45d22]">Kymera Guard</p><h2 id="guard-title" className="mt-2 text-xl font-semibold text-[#24211f]">Configure a Guard session</h2><p className="mt-1 text-sm text-[#77736c]">Bind this session to the connected wallet. Transaction signing still requires a separate testnet preview and confirmation.</p></div><button className="text-sm text-[#77736c]" onClick={() => setOpen(false)}>Close</button></div>
        <div className="mt-6 flex flex-col gap-4"><label className="text-sm text-[#3f3a36]">Connected wallet<input readOnly className="mt-1 w-full rounded-lg border border-[#d9d4cd] bg-[#f5f2ee] px-3 py-2 font-mono text-xs" value={userAddress || 'Connect a wallet in the Dashboard gate'} /></label><label className="text-sm text-[#3f3a36]">Duration (hours)<input type="number" min="1" max="720" className="mt-1 w-full rounded-lg border border-[#d9d4cd] bg-white px-3 py-2" value={durationHours} onChange={(event) => setDurationHours(Number(event.target.value))} /></label><label className="text-sm text-[#3f3a36]">Spending limit<input type="number" min="0" className="mt-1 w-full rounded-lg border border-[#d9d4cd] bg-white px-3 py-2" value={spendingLimit} onChange={(event) => setSpendingLimit(event.target.value)} /></label><div><p className="text-sm text-[#3f3a36]">Permissions</p><div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">{['read_market_data', 'analyze_positions', 'execute_trades', 'submit_transactions'].map((permission) => <button key={permission} className={`rounded-lg border px-3 py-2 text-left text-xs ${permissions.includes(permission) ? 'border-[#f45d22] bg-[#fff1eb] text-[#b84b1f]' : 'border-[#d9d4cd] text-[#77736c]'}`} onClick={() => toggle(permission)}>{permissions.includes(permission) ? 'Enabled · ' : ''}{permission.replaceAll('_', ' ')}</button>)}</div></div></div>
        <div className="mt-6 flex items-center justify-between gap-4"><span className="text-xs text-[#77736c]">{status}</span><button className="rounded-lg bg-[#f45d22] px-4 py-2 text-sm font-semibold text-white" onClick={create}>Create session</button></div>
      </div>
    </div>}
  </>
}
