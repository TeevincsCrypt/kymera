'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Bot, ShieldCheck } from 'lucide-react'
import { useKymeraSession } from '@/lib/web3/kymera-session'
import { KYMERA_CHAIN_ID } from '@/lib/web3/config'
import type { Agent } from '@/lib/kymera'

/** What each permission actually authorizes, in the user's terms. */
const PERMISSIONS: Array<{ id: string; label: string; detail: string; onchain: boolean }> = [
  { id: 'read_market_data', label: 'Read market data', detail: 'Look at pools, prices, and public chain data. No transactions.', onchain: false },
  { id: 'analyze_positions', label: 'Analyze positions', detail: 'Review your holdings and produce analysis. No transactions.', onchain: false },
  { id: 'execute_trades', label: 'Request swaps', detail: 'Ask Guard to authorize a PancakeSwap swap, bounded by your spending limit. You still sign every one.', onchain: true },
  { id: 'submit_transactions', label: 'Submit agent jobs', detail: 'Ask Guard to authorize an ERC-8183 job creation. You still sign every one.', onchain: true },
]

export function GuardSessionDialog({ agent, onCreated }: { agent: Agent; onCreated?: (session: { id: string }) => void }) {
  const session = useKymeraSession()
  const [open, setOpen] = useState(false)
  const [durationHours, setDurationHours] = useState(24)
  const [spendingLimit, setSpendingLimit] = useState('0.05')
  const [permissions, setPermissions] = useState<string[]>(['read_market_data', 'analyze_positions'])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [altana, setAltana] = useState<{ available: boolean; message: string | null; network: string } | null>(null)
  const [autonomous, setAutonomous] = useState(false)

  useEffect(() => {
    if (!open) return
    fetch('/api/altana/status', { cache: 'no-store' })
      .then((response) => response.json())
      .then(setAltana)
      .catch(() => setAltana(null))
  }, [open])

  const toggle = (permission: string) =>
    setPermissions((current) => (current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission]))

  const grantsOnchain = permissions.some((permission) => PERMISSIONS.find((item) => item.id === permission)?.onchain)

  async function create() {
    setBusy(true); setStatus('')
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agentId: agent.id,
          durationHours,
          spendingLimit: spendingLimit === '' ? undefined : Number(spendingLimit),
          permissions,
          chainId: KYMERA_CHAIN_ID,
        }),
      })
      const payload = await response.json()
      if (!response.ok) { setStatus(payload.error || 'Unable to create session'); return }

      // The session exists and is usable either way. Activating an agent wallet is an
      // upgrade on top of it, so a failure here is reported without discarding the grant.
      if (autonomous && altana?.available) {
        const activation = await fetch(`/api/altana/session/${payload.session.id}`, { method: 'POST' })
        const result = await activation.json().catch(() => ({}))
        if (!activation.ok) {
          setStatus(`Guard session active, but the agent wallet could not be activated: ${result.error ?? 'unknown error'} You can retry from Permissions.`)
          onCreated?.(payload.session)
          return
        }
        setStatus('Guard session active and delegated on-chain to an agent wallet.')
        onCreated?.(payload.session)
        setTimeout(() => setOpen(false), 1400)
        return
      }

      setStatus('Guard session active.')
      onCreated?.(payload.session)
      setTimeout(() => setOpen(false), 900)
    } catch {
      setStatus('Could not reach Kymera. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!session.isConnected) {
    return <button type="button" onClick={session.openWalletChooser} className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">Connect wallet to hire</button>
  }

  if (!session.isAuthenticated) {
    return (
      <div>
        <button type="button" onClick={() => void session.signIn()} disabled={session.authPending} className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {session.authPending ? 'Waiting for signature…' : 'Sign in with wallet'}
        </button>
        <p className="mt-2 text-xs text-muted-foreground">Kymera verifies you control this wallet before granting any permission. This signature is free and moves nothing.</p>
        {session.authError && <p className="mt-2 text-xs text-destructive">{session.authError}</p>}
      </div>
    )
  }

  return (
    <>
      <button type="button" className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground" onClick={() => setOpen(true)}>
        Grant Guard permissions
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4" role="dialog" aria-modal="true" aria-labelledby="guard-title">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
                  <ShieldCheck size={12} aria-hidden /> Kymera Guard
                </p>
                <h2 id="guard-title" className="mt-2 text-xl font-semibold">Set what {agent.name} may do</h2>
                <p className="mt-1 text-sm text-muted-foreground">Guard enforces these limits on every action before your wallet is opened.</p>
              </div>
              <button type="button" className="text-sm text-muted-foreground" onClick={() => setOpen(false)}>Close</button>
            </div>

            <div className="mt-6 flex flex-col gap-4">
              <label className="text-sm font-medium">
                Wallet
                <input readOnly aria-label="Connected wallet" className="mt-1 w-full rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs" value={session.address ?? ''} />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">
                  Duration (hours)
                  <input type="number" min={1} max={720} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-normal" value={durationHours} onChange={(event) => setDurationHours(Number(event.target.value))} />
                </label>
                <label className="text-sm font-medium">
                  Spending limit
                  <input type="number" min={0} step="0.01" className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-normal" value={spendingLimit} onChange={(event) => setSpendingLimit(event.target.value)} />
                  <span className="mt-1 block text-[11px] font-normal leading-4 text-muted-foreground">Total per asset across the whole session. Guard counts every approved action against it.</span>
                </label>
              </div>

              <div>
                <p className="text-sm font-medium">Permissions</p>
                <div className="mt-2 flex flex-col gap-2">
                  {PERMISSIONS.map((permission) => {
                    const active = permissions.includes(permission.id)
                    return (
                      <button
                        key={permission.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggle(permission.id)}
                        className={`rounded-xl border px-3 py-2.5 text-left transition ${active ? 'border-primary bg-secondary' : 'border-border hover:border-[#d7d2cb]'}`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{permission.label}</span>
                          {permission.onchain && <span className="rounded-full bg-[#fff1eb] px-2 py-0.5 text-[10px] font-medium text-[#b84b1f]">On-chain</span>}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{permission.detail}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {grantsOnchain && (
                <p className="flex items-start gap-2 rounded-xl border border-[#f1d5c8] bg-[#fff7f2] p-3 text-xs leading-5 text-[#9d4925]">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                  This session can request on-chain transactions. Guard restricts them to allowlisted contracts and methods within your spending limit, and you sign every one — but grant it only if you intend that.
                </p>
              )}

              {grantsOnchain && altana && (
                altana.available ? (
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border p-3">
                    <input type="checkbox" checked={autonomous} onChange={(event) => setAutonomous(event.target.checked)} className="mt-0.5" />
                    <span>
                      <span className="flex items-center gap-1.5 text-sm font-medium"><Bot size={13} aria-hidden /> Let this agent act on its own</span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        Creates an Altana agent wallet on {altana.network} and delegates a session key to it, so the agent can execute
                        within these exact limits without a prompt each time. The contracts it may call and this spending limit are
                        written into that delegation and enforced by its account contract on-chain. Your own wallet is never a signer,
                        the agent wallet holds only what you send it, and revoking this session kills the key.
                      </span>
                    </span>
                  </label>
                ) : (
                  <p className="rounded-xl border border-dashed border-border p-3 text-xs leading-5 text-muted-foreground">
                    Autonomous execution is unavailable on this deployment, so this agent will ask you to sign each action.
                    {altana.message ? ` ${altana.message}` : ''}
                  </p>
                )
              )}

              <p className="rounded-xl bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">
                Moving funds out of your wallet is never grantable, and nothing here lets Kymera sign from your wallet. An agent
                wallet, if you activate one, holds only what you send it and can only make the calls listed above.
              </p>
            </div>

            <div className="mt-6 flex items-center justify-between gap-4">
              <span className="text-xs text-muted-foreground">{status}</span>
              <button type="button" disabled={busy || permissions.length === 0} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50" onClick={create}>
                {busy ? 'Creating…' : 'Create session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
