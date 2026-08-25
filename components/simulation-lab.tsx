'use client'

import { useState } from 'react'
import { Check, Minus, Play, ShieldAlert, ShieldCheck, X } from 'lucide-react'
import { useKymeraSession } from '@/lib/web3/kymera-session'
import { TestnetWalletGuard } from '@/components/testnet-wallet-guard'
import { KYMERA_CHAIN_ID } from '@/lib/web3/config'

type Agent = { id: string; name: string; category: string }
type Check = { id: string; label: string; status: 'passed' | 'failed' | 'not_evaluated'; detail?: string }
type DryRun = {
  authenticated: boolean
  message?: string
  decision: { allowed: boolean; reason: string; message: string; checks: Check[]; metadata: Record<string, unknown> } | null
  disclaimer?: string
}

const ACTIONS = [
  { id: 'swap', label: 'PancakeSwap swap', needsAmount: true },
  { id: 'approve_token', label: 'Token approval', needsAmount: true },
  { id: 'create_job', label: 'ERC-8183 agent job', needsAmount: false },
] as const

function StatusIcon({ status }: { status: Check['status'] }) {
  if (status === 'passed') return <Check size={14} className="mt-0.5 shrink-0 text-[#138a61]" aria-hidden />
  if (status === 'failed') return <X size={14} className="mt-0.5 shrink-0 text-destructive" aria-hidden />
  return <Minus size={14} className="mt-0.5 shrink-0 text-muted-foreground/50" aria-hidden />
}

/**
 * Guard dry-run. Runs the real authorization engine in read-only mode so a user can
 * see exactly where an action would be stopped, without recording anything.
 */
export function SimulationLab({ agents, initialAgentId }: { agents: Agent[]; initialAgentId?: string }) {
  const session = useKymeraSession()
  const [agentId, setAgentId] = useState(() => (initialAgentId && agents.some((agent) => agent.id === initialAgentId) ? initialAgentId : agents[0]?.id || ''))
  const [action, setAction] = useState<(typeof ACTIONS)[number]['id']>('swap')
  const [amount, setAmount] = useState('0.05')
  const [token, setToken] = useState('')
  const [result, setResult] = useState<DryRun | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function run() {
    setLoading(true); setError(''); setResult(null)
    try {
      const response = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agentId: agentId || undefined, action, amount, token: token || undefined, chainId: KYMERA_CHAIN_ID }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Dry-run failed')
      setResult(payload)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Dry-run failed')
    } finally {
      setLoading(false)
    }
  }

  const needsAmount = ACTIONS.find((item) => item.id === action)?.needsAmount

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">
      <p className="text-sm font-medium text-primary">Guard dry-run</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-[-.045em] md:text-5xl">See exactly what Guard would decide.</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
        This runs the same authorization engine that gates real transactions, in read-only mode. Nothing is recorded, no spending limit is reserved, and no transaction is prepared.
      </p>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-wrap gap-4">
            <label className="flex-1 text-sm font-semibold">
              Agent
              <select value={agentId} onChange={(event) => setAgentId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal">
                <option value="">Any agent with an active session</option>
                {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.category}</option>)}
              </select>
            </label>
            <label className="min-w-48 flex-1 text-sm font-semibold">
              Action
              <select value={action} onChange={(event) => setAction(event.target.value as typeof action)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal">
                {ACTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
          </div>

          {needsAmount && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold">
                Amount
                <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal" />
              </label>
              <label className="text-sm font-semibold">
                Token address <span className="font-normal text-muted-foreground">(optional)</span>
                <input value={token} onChange={(event) => setToken(event.target.value)} placeholder="0x…" className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 font-mono text-xs font-normal" />
              </label>
            </div>
          )}

          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Try raising the amount above your session’s spending limit to watch Guard reject it — that rejection is the product working, not an error.
          </p>

          <button type="button" onClick={run} disabled={loading} className="mt-4 flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            <Play size={15} aria-hidden />{loading ? 'Running Guard…' : 'Run Guard dry-run'}
          </button>
          {error && <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        </section>

        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-semibold">Guard decision</h2>

          {!session.isAuthenticated && (
            <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              Sign in with your wallet to dry-run Guard against your own sessions and limits.
            </div>
          )}

          {result?.decision ? (
            <>
              <div className={`mt-4 flex items-start gap-2 rounded-xl border p-4 ${result.decision.allowed ? 'border-[#138a61]/30 bg-[#138a61]/5' : 'border-destructive/30 bg-destructive/5'}`}>
                {result.decision.allowed
                  ? <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#138a61]" aria-hidden />
                  : <ShieldAlert size={18} className="mt-0.5 shrink-0 text-destructive" aria-hidden />}
                <div>
                  <p className={`text-sm font-semibold ${result.decision.allowed ? 'text-[#138a61]' : 'text-destructive'}`}>
                    {result.decision.allowed ? 'Guard would allow this action' : 'Guard would block this action'}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{result.decision.message}</p>
                  <p className="mt-2 inline-flex rounded-md bg-background px-2 py-1 font-mono text-[10px] uppercase tracking-wider">{result.decision.reason}</p>
                </div>
              </div>

              <ul className="mt-4 flex flex-col gap-2">
                {result.decision.checks.map((check) => (
                  <li key={check.id} className="flex items-start gap-2 text-xs">
                    <StatusIcon status={check.status} />
                    <span className={check.status === 'failed' ? 'font-medium text-destructive' : check.status === 'not_evaluated' ? 'text-muted-foreground/60' : 'text-muted-foreground'}>
                      {check.label}{check.detail ? <span className="text-muted-foreground/70"> — {check.detail}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>

              {result.disclaimer && <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">{result.disclaimer}</p>}
            </>
          ) : (
            <div className="mt-4 flex min-h-56 items-center justify-center rounded-xl border border-dashed border-border text-center text-sm text-muted-foreground">
              <div>
                <ShieldCheck className="mx-auto mb-3 text-primary" size={24} aria-hidden />
                <p>{result?.message ?? 'Configure an action and run the dry-run.'}</p>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* The dry-run above proves the decision; this proves the whole path end to end
          with a real, Guard-gated transaction on BNB testnet. */}
      <section className="mt-12">
        <p className="text-sm font-medium text-primary">Live execution</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Run a real Guard-gated transaction</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          The dry-run shows what Guard would decide. This does it for real: an ERC-8183 agent job on
          BNB testnet, authorized by Guard and signed in your wallet.
        </p>
        <div className="mt-5"><TestnetWalletGuard /></div>
      </section>
    </div>
  )
}
