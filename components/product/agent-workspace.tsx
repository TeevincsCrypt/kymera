'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Check, Info, Loader2, Minus, ShieldAlert, ShieldCheck, X } from 'lucide-react'
import { useKymeraSession } from '@/lib/web3/kymera-session'
import { useGuardExecution, type GuardCheck } from '@/lib/web3/use-guard-execution'
import { RequireWallet, explorerFor, type SessionRow, type Summary } from '@/components/product/shared'
import { KYMERA_CHAIN_ID } from '@/lib/web3/config'
import type { Agent } from '@/lib/kymera'

type Opportunity = {
  address: string
  token0: { symbol: string; address: string }
  token1: { symbol: string; address: string }
  tvl: number | null
  apr: number | null
  opportunityScore: number
  opportunityReason: string
}

/**
 * The operate surface.
 *
 * IMPORTANT: Kymera has no agent runtime — it does not execute agent code. So this
 * page never puts words in an agent's mouth or invents a recommendation. What it does
 * is real: it shows live protocol data, lets you compose an action on the agent's
 * behalf, and runs that action through the same Guard that gates everything else.
 */
export function AgentWorkspace({ agent }: { agent: Agent }) {
  return (
    <div className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">
      <Link href="/agents" className="text-sm text-muted-foreground hover:text-foreground">← My agents</Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">Agent workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] md:text-4xl">{agent.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{agent.category} · {agent.score === null ? 'Not yet scored' : `Kymera Score ${agent.score}/100`}</p>
        </div>
        <Link href={`/agents/${agent.id}`} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium">View profile</Link>
      </div>

      <div className="mt-10"><RequireWallet title="This workspace"><Body agent={agent} /></RequireWallet></div>
    </div>
  )
}

function Body({ agent }: { agent: Agent }) {
  const session = useKymeraSession()
  const guard = useGuardExecution()
  const [grants, setGrants] = useState<SessionRow[]>([])
  const [sessionId, setSessionId] = useState('')
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [marketLoading, setMarketLoading] = useState(false)
  const [marketError, setMarketError] = useState('')
  const [intent, setIntent] = useState('Find lower-risk BNB yield opportunities worth reviewing.')
  const [amount, setAmount] = useState('0.01')
  const [selected, setSelected] = useState<Opportunity | null>(null)

  const chainId = session.chainId ?? KYMERA_CHAIN_ID

  const loadGrants = useCallback(() => {
    fetch('/api/dashboard/summary', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload: Summary) => {
        const mine = (payload.sessions || []).filter((row) => row.agentId === agent.id && row.status === 'Active')
        setGrants(mine)
        setSessionId((current) => current || mine[0]?.id || '')
      })
      .catch(() => setGrants([]))
  }, [agent.id])

  useEffect(() => { loadGrants() }, [loadGrants])

  async function analyse() {
    setMarketLoading(true); setMarketError(''); setSelected(null)
    try {
      const response = await fetch('/api/pancakeswap/opportunities', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ task: intent }),
      })
      const payload = await response.json()
      if (!response.ok) { setMarketError(payload.error || 'Live market data is unavailable.'); return }
      setOpportunities((payload.opportunities || []).slice(0, 5))
    } catch {
      setMarketError('Could not reach the market data service.')
    } finally {
      setMarketLoading(false)
    }
  }

  const activeGrant = grants.find((grant) => grant.id === sessionId)
  const canRequest = Boolean(activeGrant && selected && /^\d+(\.\d+)?$/.test(amount) && Number(amount) > 0)

  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      {/* ------------------------------------------------------------- compose */}
      <div className="flex flex-col gap-6">
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-semibold">1 · What do you want done?</h2>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
            Kymera reads live PancakeSwap data and ranks it against your request. This ranking is
            Kymera&apos;s own deterministic analysis of on-chain data — not the agent thinking, because
            Kymera does not execute agent code.
          </p>
          <textarea
            value={intent}
            onChange={(event) => setIntent(event.target.value)}
            rows={3}
            className="mt-4 w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm leading-6 outline-none focus:border-primary"
          />
          <button type="button" onClick={analyse} disabled={marketLoading} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {marketLoading && <Loader2 size={14} className="animate-spin" aria-hidden />}
            {marketLoading ? 'Reading live pools…' : 'Analyze the market'}
          </button>
          {marketError && <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{marketError}</p>}
        </section>

        {opportunities.length > 0 && (
          <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-semibold">2 · Pick what to act on</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">Ranked from live TVL, volume, and APR against your request.</p>
            <div className="mt-4 flex flex-col gap-2.5">
              {opportunities.map((pool) => {
                const active = selected?.address === pool.address
                return (
                  <button
                    key={pool.address}
                    type="button"
                    onClick={() => setSelected(pool)}
                    aria-pressed={active}
                    className={`rounded-xl border p-4 text-left transition ${active ? 'border-primary bg-secondary' : 'border-border hover:border-[#d7d2cb]'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold">{pool.token0.symbol}/{pool.token1.symbol}</span>
                      <span className="font-mono text-xs text-muted-foreground">{pool.opportunityScore}/100</span>
                    </div>
                    <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{pool.opportunityReason}</p>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-semibold">3 · Request the action</h2>
          {grants.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-border p-4">
              <p className="text-sm text-muted-foreground">
                This agent has no active permission grant, so it cannot request anything on-chain.
              </p>
              <Link href={`/agents/${agent.id}`} className="mt-3 inline-block text-sm font-semibold text-primary">Configure permissions →</Link>
            </div>
          ) : (
            <>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">
                  Permission grant
                  <select value={sessionId} onChange={(event) => setSessionId(event.target.value)} className="mt-1.5 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal">
                    {grants.map((grant) => (
                      <option key={grant.id} value={grant.id}>limit {grant.spendingLimit ?? 'none'} · expires {new Date(grant.expiresAt).toLocaleDateString()}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium">
                  Amount
                  <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" className="mt-1.5 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal" />
                </label>
              </div>

              <button
                type="button"
                disabled={!canRequest || guard.state === 'authorizing' || guard.state === 'awaiting_signature'}
                onClick={() => selected && guard.authorizeAndSign({
                  action: 'swap',
                  chainId,
                  agentId: agent.id,
                  sessionId,
                  token: selected.token0.address,
                  tokenOut: selected.token1.address,
                  decimals: 18,
                  amount,
                })}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                Submit to Guard <ArrowRight size={14} aria-hidden />
              </button>
              {!selected && <p className="mt-2 text-xs text-muted-foreground">Pick an opportunity above first.</p>}
            </>
          )}
        </section>
      </div>

      {/* -------------------------------------------------------------- pipeline */}
      <GuardPipeline
        state={guard.state}
        checks={guard.decision?.checks ?? []}
        reason={guard.decision?.reason}
        message={guard.decision?.message}
        txHash={guard.txHash}
        error={guard.error}
        chainId={chainId}
      />
    </div>
  )
}

/**
 * The Guard pipeline, shown as the two decisions it genuinely makes:
 * does policy allow this, and does the live session still authorize it.
 */
function GuardPipeline({
  state, checks, reason, message, txHash, error, chainId,
}: {
  state: string
  checks: GuardCheck[]
  reason?: string
  message?: string
  txHash?: string
  error?: string
  chainId: number
}) {
  const policyIds = ['wallet', 'action', 'chain', 'contract', 'method', 'amount']
  const sessionIds = ['session', 'session_owner', 'session_status', 'session_expiry', 'agent', 'permission', 'spending_cap']

  const stage = (ids: string[]) => checks.filter((check) => ids.includes(check.id))
  const blocked = state === 'rejected'
  const idle = state === 'idle' && checks.length === 0

  return (
    <aside className="h-fit rounded-2xl border border-border bg-card p-6 lg:sticky lg:top-24">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Kymera Guard</p>
      <h2 className="mt-2 text-lg font-semibold">Every request is checked here</h2>

      {idle ? (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-muted/50 p-4 text-sm leading-6 text-muted-foreground">
          <Info size={15} className="mt-0.5 shrink-0" aria-hidden />
          Submit an action and Guard evaluates it in two stages. If either fails, no transaction is prepared and your wallet never opens.
        </p>
      ) : (
        <div className="mt-5 flex flex-col gap-5">
          <Stage title="Policy check" subtitle="Is this action allowed at all?" checks={stage(policyIds)} />
          <Stage title="Session authorization" subtitle="Does the live grant still permit it?" checks={stage(sessionIds)} />

          <div className={`rounded-xl border p-4 ${blocked ? 'border-destructive/30 bg-destructive/5' : state === 'confirmed' ? 'border-[#138a61]/30 bg-[#138a61]/5' : 'border-border bg-muted/40'}`}>
            <p className="flex items-center gap-2 text-sm font-semibold">
              {blocked
                ? <><ShieldAlert size={15} className="text-destructive" aria-hidden /><span className="text-destructive">Blocked</span></>
                : state === 'confirmed'
                  ? <><ShieldCheck size={15} className="text-[#138a61]" aria-hidden /><span className="text-[#138a61]">Confirmed on-chain</span></>
                  : <><Loader2 size={15} className="animate-spin text-muted-foreground" aria-hidden /><span>{labelFor(state)}</span></>}
            </p>
            {message && <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{message}</p>}
            {reason && blocked && <p className="mt-2 inline-flex rounded-md bg-destructive/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-destructive">{reason}</p>}
            {error && !blocked && <p className="mt-2 text-xs text-destructive">{error}</p>}
            {txHash && (
              <a href={`${explorerFor(chainId)}/tx/${txHash}`} target="_blank" rel="noreferrer" className="mt-2 block break-all text-xs font-medium text-primary underline underline-offset-2">
                View transaction on BscScan
              </a>
            )}
          </div>
        </div>
      )}

      <p className="mt-5 border-t border-border pt-4 text-[11px] leading-5 text-muted-foreground">
        Kymera holds no keys. Every transaction is signed by you in your own wallet — there is no path
        by which an action executes without your signature.
      </p>
    </aside>
  )
}

function labelFor(state: string) {
  if (state === 'authorizing') return 'Checking…'
  if (state === 'awaiting_signature') return 'Approved — confirm in your wallet'
  if (state === 'submitted') return 'Submitted to the network'
  if (state === 'confirming') return 'Waiting for confirmation…'
  if (state === 'failed') return 'Did not complete'
  return 'Ready'
}

function Stage({ title, subtitle, checks }: { title: string; subtitle: string; checks: GuardCheck[] }) {
  const failed = checks.some((check) => check.status === 'failed')
  const allPassed = checks.length > 0 && checks.every((check) => check.status === 'passed')
  return (
    <div>
      <div className="flex items-center gap-2">
        {failed ? <X size={14} className="text-destructive" aria-hidden />
          : allPassed ? <Check size={14} className="text-[#138a61]" aria-hidden />
          : <Minus size={14} className="text-muted-foreground/50" aria-hidden />}
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <ul className="mt-2 flex flex-col gap-1 pl-6">
        {checks.map((check) => (
          <li key={check.id} className="flex items-start gap-2 text-xs">
            {check.status === 'passed' ? <Check size={12} className="mt-0.5 shrink-0 text-[#138a61]" aria-hidden />
              : check.status === 'failed' ? <X size={12} className="mt-0.5 shrink-0 text-destructive" aria-hidden />
              : <Minus size={12} className="mt-0.5 shrink-0 text-muted-foreground/40" aria-hidden />}
            <span className={check.status === 'failed' ? 'font-medium text-destructive' : check.status === 'not_evaluated' ? 'text-muted-foreground/50' : 'text-muted-foreground'}>
              {check.label}{check.detail ? <span className="text-muted-foreground/70"> — {check.detail}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
