'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { PancakeActionPanel } from '@/components/pancake-action-panel'

type Pool = {
  id: string
  feeTier: number | null
  token0: { address: string; symbol: string; decimals: number }
  token1: { address: string; symbol: string; decimals: number }
  tvlUsd: number | null
  volume24hUsd: number | null
  apr: number | null
  risk: string
}

export function PancakeSwapPage() {
  const [task, setTask] = useState('Find lower-risk BNB yield opportunities and tell me which pools need review.')
  const [pools, setPools] = useState<Pool[]>([])
  const [status, setStatus] = useState<{ configured: boolean; chain: string; source: string } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [criteria, setCriteria] = useState<string[]>([])
  const [reasons, setReasons] = useState<Record<string, string>>({})

  async function analyze() {
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/pancakeswap/opportunities', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ task }),
      })
      const payload = await response.json().catch(() => ({}))
      setStatus(payload.status || null)
      setLastUpdated(payload.updatedAt || new Date().toISOString())
      setCriteria(payload.criteria || [])
      setReasons(Object.fromEntries(((payload.opportunities || []) as Array<Record<string, any>>).map((item) => [item.address || item.id, item.opportunityReason])))
      setPools(
        (payload.opportunities || []).map((item: Record<string, any>) => ({
          id: item.address || item.id,
          feeTier: item.feeTier ?? null,
          token0: item.token0,
          token1: item.token1,
          tvlUsd: item.tvl ?? item.tvlUsd ?? null,
          volume24hUsd: item.volume24h ?? null,
          apr: item.apr ?? null,
          risk: (item.tvl ?? 0) >= 10_000_000 ? 'Lower' : (item.tvl ?? 0) >= 1_000_000 ? 'Moderate' : 'Higher',
        })).filter((pool: Pool) => pool.id && pool.token0 && pool.token1),
      )
      if (!response.ok) setError(payload.error || 'Live PancakeSwap data is unavailable.')
    } catch {
      setError('Could not reach the PancakeSwap data service.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background px-5 py-10 md:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">Live protocol data</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-[-.04em] md:text-4xl">PancakeSwap opportunities</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
              Pool analytics read live from the official PancakeSwap subgraph. Swaps run through Kymera Guard before your wallet is ever opened.
            </p>
          </div>
          {status && (
            <div className={`rounded-xl border px-4 py-3 text-xs ${status.configured ? 'border-[#c6e8da] bg-[#f1fbf6] text-[#138a61]' : 'border-[#f1d5c8] bg-[#fff7f2] text-[#b84b1f]'}`}>
              <div className="font-semibold">{status.configured ? 'Live data connected' : 'Live data unavailable'}</div>
              <div className="mt-1">{status.source} · {status.chain}{lastUpdated ? ` · ${new Date(lastUpdated).toLocaleTimeString()}` : ''}</div>
            </div>
          )}
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
          <section className="rounded-2xl border border-border bg-card p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Ask Kymera</p>
            <label className="mt-4 block text-sm font-medium">
              What are you looking for?
              <textarea value={task} onChange={(event) => setTask(event.target.value)} rows={4} className="mt-2 w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm font-normal leading-6 outline-none focus:border-primary" />
            </label>
            <select value="" onChange={(event) => event.target.value && setTask(event.target.value)} aria-label="Preset task" className="mt-3 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm">
              <option value="">Choose an example…</option>
              <option>Find lower-risk BNB yield opportunities and tell me which pools need review.</option>
              <option>Rank the highest-TVL PancakeSwap pools with missing APR data.</option>
              <option>Find volatile pools with strong recent volume for monitoring.</option>
            </select>
            <button type="button" onClick={analyze} disabled={loading} className="mt-5 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {loading ? 'Analyzing…' : 'Analyze pools'}
            </button>
            {criteria.length > 0 && (
              <div className="mt-4 rounded-xl bg-muted/60 p-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Criteria applied from your request</p>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {criteria.map((item) => <li key={item} className="text-xs leading-5 text-foreground">• {item}</li>)}
                </ul>
              </div>
            )}
            {error && <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
          </section>

          <section className="rounded-2xl border border-border bg-card p-6">
            <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <ShieldCheck size={12} className="text-primary" aria-hidden /> Execution boundary
            </p>
            <h2 className="mt-3 text-xl font-semibold">Guard runs before your wallet does.</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Every swap request is checked against your Guard session: the router contract, the method, your spending limit, and an on-chain simulation. Kymera builds the calldata; your wallet signs exactly those bytes.
            </p>
            <ul className="mt-5 grid gap-2 text-xs">
              <li className="rounded-lg bg-muted/60 px-3 py-2 text-muted-foreground">Reading pool data needs no permission at all</li>
              <li className="rounded-lg bg-muted/60 px-3 py-2 text-muted-foreground">Swaps require an active session with <code className="rounded bg-background px-1">execute_trades</code></li>
              <li className="rounded-lg bg-[#fff1eb] px-3 py-2 text-[#b84b1f]">A request over your limit is refused — no wallet prompt appears</li>
            </ul>
          </section>
        </div>

        <section className="mt-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Ranked evidence</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-.03em]">Pool opportunities</h2>
            </div>
            <span className="text-xs text-muted-foreground">{pools.length} results</span>
          </div>

          {pools.length ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {pools.map((pool) => (
                <article key={pool.id} className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">{pool.token0.symbol}/{pool.token1.symbol}</h3>
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">{pool.id.slice(0, 12)}…</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">{pool.risk} risk</span>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">APR</p>
                      <p className="mt-1 font-semibold tabular-nums">{pool.apr === null ? 'Unavailable' : `${pool.apr.toFixed(2)}%`}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">TVL</p>
                      <p className="mt-1 font-semibold tabular-nums">{pool.tvlUsd === null ? 'Unavailable' : `$${Math.round(pool.tvlUsd).toLocaleString()}`}</p>
                    </div>
                  </div>
                  {reasons[pool.id] && (
                    <p className="mt-4 rounded-lg bg-muted/50 px-3 py-2 text-[11px] leading-5 text-muted-foreground">{reasons[pool.id]}</p>
                  )}
                  <Link
                    href={`/arena?task=${encodeURIComponent(`Compare agents for ${pool.token0.symbol}/${pool.token1.symbol} PancakeSwap pool analysis`)}`}
                    className="mt-3 inline-block rounded-lg border border-border px-3 py-2 text-xs font-medium"
                  >
                    Compare agents
                  </Link>
                  <PancakeActionPanel tokenIn={pool.token0.address} tokenOut={pool.token1.address} feeTier={pool.feeTier} />
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-border bg-card p-10 text-center">
              <p className="text-sm font-medium">{loading ? 'Loading live pools…' : 'Analyze pools to see ranked opportunities.'}</p>
              <p className="mt-2 text-xs text-muted-foreground">Results appear only when the official PancakeSwap subgraph responds.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
