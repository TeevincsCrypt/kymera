'use client'

import { useState } from 'react'
import { Briefcase, Check, Loader2 } from 'lucide-react'
import { useKymeraSession } from '@/lib/web3/kymera-session'
import { useGuardExecution } from '@/lib/web3/use-guard-execution'
import { GuardDecisionPanel } from '@/components/guard-decision'
import { KYMERA_CHAIN_ID } from '@/lib/web3/config'
import type { Agent } from '@/lib/kymera'

type HireResult = {
  hire?: { id: string; status: string; task: string }
  txHash?: string
  payment?: { mode: string; status: string; disclosure: string }
  rejectedPermissions?: string[]
  sessionId?: string | null
  error?: string
}

/** Read-only capabilities a hire may request. Execution rights are a separate,
 *  deliberate Guard grant — hiring never confers them. */
const HIRE_PERMISSIONS = [
  { id: 'read_market_data', label: 'Read market data', detail: 'Public chain and pool data. No transactions.' },
  { id: 'analyze_positions', label: 'Analyze positions', detail: 'Review holdings and produce analysis. No transactions.' },
]

export function HireAgentDialog({ agent }: { agent: Agent }) {
  const session = useKymeraSession()
  const [open, setOpen] = useState(false)
  const [task, setTask] = useState('')
  const [permissions, setPermissions] = useState<string[]>(['read_market_data', 'analyze_positions'])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<HireResult | null>(null)
  const [error, setError] = useState('')
  const [amount, setAmount] = useState('0.001')
  const payment = useGuardExecution()

  // Only an agent with a real owner address can be paid on-chain.
  const payable = /^0x[a-fA-F0-9]{40}$/.test(agent.creator) && !/^0x0{40}$/i.test(agent.creator)
  const chainId = session.chainId ?? KYMERA_CHAIN_ID

  const toggle = (id: string) =>
    setPermissions((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))

  async function hire() {
    if (!task.trim()) { setError('Describe what you want this agent to do.'); return }
    setBusy(true); setError(''); setResult(null)
    try {
      const created = await fetch('/api/hires', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agentId: agent.id, task: task.trim(), requestedPermissions: permissions }),
      })
      const payload = await created.json() as HireResult
      if (!created.ok) { setError(payload.error || 'Could not create the hire.'); return }

      const hireId = payload.hire?.id
      if (!hireId) { setError('The hire was created but no id came back.'); return }

      if (!payable) {
        setError('This agent has no resolvable owner address in the registry, so it cannot be paid on-chain.')
        return
      }

      // Real on-chain payment: Guard authorises the recipient, amount and chain, the
      // wallet signs a native BNB transfer, and the hire activates only once that
      // transaction is confirmed.
      const flow = await payment.authorizeAndSign({
        action: 'hire_payment',
        chainId,
        agentId: agent.id,
        token: agent.creator,
        amount,
        hireId,
      })
      if (!flow.ok) { setError(flow.decision?.message || 'Guard did not authorise the payment.'); return }

      setResult({ hire: { id: hireId, status: 'ACTIVE', task: task.trim() }, txHash: flow.txHash })
    } catch {
      setError('Could not reach Kymera.')
    } finally {
      setBusy(false)
    }
  }

  if (!session.isConnected) {
    return (
      <button type="button" onClick={session.openWalletChooser} className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">
        Connect wallet to hire
      </button>
    )
  }

  if (!session.isAuthenticated) {
    return (
      <div>
        <button type="button" onClick={() => void session.signIn()} disabled={session.authPending} className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {session.authPending ? 'Waiting for signature…' : 'Sign in to hire'}
        </button>
        {session.authError && <p className="mt-2 text-xs text-destructive">{session.authError}</p>}
      </div>
    )
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">
        <Briefcase size={15} aria-hidden /> Hire {agent.name}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4" role="dialog" aria-modal="true" aria-labelledby="hire-title">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Hire an agent</p>
                <h2 id="hire-title" className="mt-2 text-xl font-semibold">{agent.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{agent.category} · {agent.origin === 'ERC-8004' ? 'ERC-8004 registered' : 'Local catalog'}</p>
              </div>
              <button type="button" className="text-sm text-muted-foreground" onClick={() => { setOpen(false); setResult(null) }}>Close</button>
            </div>

            {result?.hire ? (
              <div className="mt-6">
                <div className="flex items-start gap-2 rounded-xl border border-[#138a61]/30 bg-[#138a61]/5 p-4">
                  <Check size={16} className="mt-0.5 shrink-0 text-[#138a61]" aria-hidden />
                  <div>
                    <p className="text-sm font-semibold text-[#138a61]">{agent.name} is hired</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Status <strong>{result.hire.status}</strong>. A read-only Guard session was created with the permissions you approved.
                    </p>
                  </div>
                </div>
                {result.txHash && (
                  <p className="mt-3 break-all rounded-lg bg-muted/60 p-3 text-[11px] leading-5 text-muted-foreground">
                    Paid on-chain ·{' '}
                    <a
                      className="font-medium text-primary underline underline-offset-2"
                      href={`${chainId === KYMERA_CHAIN_ID ? 'https://testnet.bscscan.com' : 'https://bscscan.com'}/tx/${result.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      view transaction on BscScan
                    </a>
                  </p>
                )}
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  This hire grants <strong>no on-chain execution rights</strong>. To let it request transactions, grant a Guard session with a spending limit below.
                </p>
                <a href="/dashboard" className="mt-4 block rounded-xl border border-border px-4 py-2.5 text-center text-sm font-semibold">View in workspace</a>
              </div>
            ) : (
              <>
                <div className="mt-6 flex flex-col gap-4">
                  <label className="text-sm font-medium">
                    What should this agent do?
                    <textarea
                      value={task}
                      onChange={(event) => setTask(event.target.value)}
                      rows={3}
                      maxLength={2000}
                      placeholder="Monitor BNB yield pools and flag anything with liquidity risk."
                      className="mt-1.5 w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-normal leading-6 outline-none focus:border-primary"
                    />
                  </label>

                  <div>
                    <p className="text-sm font-medium">Permissions</p>
                    <div className="mt-2 flex flex-col gap-2">
                      {HIRE_PERMISSIONS.map((permission) => {
                        const active = permissions.includes(permission.id)
                        return (
                          <button
                            key={permission.id}
                            type="button"
                            aria-pressed={active}
                            onClick={() => toggle(permission.id)}
                            className={`rounded-xl border px-3 py-2.5 text-left transition ${active ? 'border-primary bg-secondary' : 'border-border hover:border-[#d7d2cb]'}`}
                          >
                            <span className="text-sm font-medium">{permission.label}</span>
                            <span className="mt-1 block text-xs leading-5 text-muted-foreground">{permission.detail}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <label className="text-sm font-medium">
                    Payment ({chainId === KYMERA_CHAIN_ID ? 'testnet BNB' : 'BNB'})
                    <input
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      inputMode="decimal"
                      className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-normal outline-none focus:border-primary"
                    />
                    <span className="mt-1 block text-[11px] font-normal leading-5 text-muted-foreground">
                      Sent directly to the agent owner{' '}
                      <code className="rounded bg-muted px-1">{agent.creator.slice(0, 10)}…{agent.creator.slice(-6)}</code>{' '}
                      as a real transaction you sign. Kymera never takes custody.
                    </span>
                  </label>

                  {!payable && (
                    <p className="rounded-xl border border-[#f1d5c8] bg-[#fff7f2] p-3 text-xs leading-5 text-[#9d4925]">
                      This agent published no resolvable owner address in the registry, so there is nobody to pay. It cannot be hired for payment.
                    </p>
                  )}

                  <p className="rounded-xl bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">
                    Hiring is read-only. It never grants the ability to move funds or submit transactions — those require a separate Guard session with an explicit spending limit.
                  </p>
                </div>

                <GuardDecisionPanel
                  decision={payment.decision}
                  state={payment.state}
                  txHash={payment.txHash}
                  error={payment.error}
                  explorerBase={chainId === KYMERA_CHAIN_ID ? 'https://testnet.bscscan.com' : 'https://bscscan.com'}
                />

                {error && <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

                <div className="mt-6 flex items-center justify-end gap-3">
                  <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted-foreground">Cancel</button>
                  <button type="button" onClick={hire} disabled={busy || permissions.length === 0 || !payable} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                    {busy && <Loader2 size={14} className="animate-spin" aria-hidden />}
                    {busy ? 'Awaiting wallet…' : `Pay ${amount} & hire`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
