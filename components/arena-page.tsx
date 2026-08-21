'use client'

import { useState } from 'react'
import { Info } from 'lucide-react'
import type { Agent } from '@/lib/kymera'

type Ranking = {
  agentId: string
  name: string
  rank: number
  score: number
  capabilityMatch: number
  taskRelevance: number
  identityStrength: number
  evaluationScore: number | null
  evaluated: boolean
  appliedWeights: Record<string, number>
  reasons: string[]
}

type Methodology = {
  method: string
  executesAgents: boolean
  summary: string
  measures: ReadonlyArray<{ id: string; weight: number; label: string; describes: string }>
  doesNotMeasure: readonly string[]
}

type Result = {
  benchmarkId: string
  task: string
  taskLabel: string
  methodology: Methodology
  winner: Ranking
  rankings: Ranking[]
  share: { title: string; text: string }
}

export function ArenaPage({ agents }: { agents: Agent[] }) {
  const [task, setTask] = useState('Compare these agents for low-risk yield monitoring on BNB Chain')
  const [selected, setSelected] = useState<string[]>(agents.slice(0, 3).map((agent) => agent.id))
  const [result, setResult] = useState<Result | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')

  async function copyShareCard() {
    const text = result?.share.text ?? ''
    if (!text) { setCopyState('error'); return }
    try {
      await navigator.clipboard.writeText(text)
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 2000)
    } catch { setCopyState('error') }
  }

  async function run() {
    setError(''); setLoading(true)
    try {
      const response = await fetch('/api/arena', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ task, agentIds: selected }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Comparison failed')
      setResult(payload)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Comparison failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-background px-6 py-10 text-foreground lg:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">The Arena</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight lg:text-6xl">Compare agents on the evidence.</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
          Describe a task and Kymera ranks the agents you pick using a published, deterministic formula over their indexed evidence.
        </p>

        <div className="mt-5 flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
          <Info size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
          <p>
            <strong className="text-foreground">The Arena does not run agents.</strong> Kymera has no agent runtime, so it cannot measure accuracy, latency, or cost — and does not pretend to. What you get is a transparent comparison of registry evidence against your task, reproducible on every run.
          </p>
        </div>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-border bg-card p-6">
            <label htmlFor="arena-task" className="text-sm font-semibold">Comparison task</label>
            <textarea
              id="arena-task"
              value={task}
              onChange={(event) => setTask(event.target.value)}
              maxLength={500}
              className="mt-3 min-h-32 w-full resize-y rounded-xl border border-input bg-background p-4 text-sm outline-none focus:border-primary"
            />
            <select value="" onChange={(event) => event.target.value && setTask(event.target.value)} aria-label="Preset task" className="mt-3 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm">
              <option value="">Choose a preset…</option>
              <option>Compare agents for low-risk yield monitoring on BNB Chain.</option>
              <option>Compare agents for PancakeSwap liquidity risk review.</option>
              <option>Compare agents for security and Guard permission analysis.</option>
              <option>Compare agents for operations triage and monitoring.</option>
            </select>
            <div className="mt-6 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">Selected <span className="font-normal text-muted-foreground">({selected.length}/5)</span></span>
              <button type="button" onClick={run} disabled={loading || selected.length < 2} className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
                {loading ? 'Comparing…' : 'Run comparison'}
              </button>
            </div>
            {error && <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Indexed agents</p>
            {agents.length ? (
              <div className="mt-4 flex max-h-72 flex-col gap-3 overflow-y-auto">
                {agents.map((agent) => (
                  <label key={agent.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3">
                    <input
                      type="checkbox"
                      checked={selected.includes(agent.id)}
                      disabled={!selected.includes(agent.id) && selected.length >= 5}
                      onChange={() => setSelected((current) => current.includes(agent.id) ? current.filter((id) => id !== agent.id) : [...current, agent.id])}
                      className="accent-[#f26622]"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{agent.name}</span>
                      <span className="block text-xs text-muted-foreground">{agent.category} · {agent.score === null ? 'not evaluated' : `score ${agent.score}`}</span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No agents indexed yet.</p>
            )}
          </div>
        </section>

        {result && (
          <>
            <section className="mt-8 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
              <div className="rounded-2xl border border-[#f0c3ad] bg-[#fff6f1] p-6">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#b84b1f]">Best fit · {result.taskLabel}</p>
                <h2 className="mt-4 text-3xl font-semibold">{result.winner.name}</h2>
                <p className="mt-2 text-5xl font-semibold text-[#f26622]">{result.winner.score}<span className="text-lg text-muted-foreground">/100</span></p>
                <p className="mt-4 text-sm leading-6 text-[#786e66]">Fit score from indexed evidence. It is not a prediction of execution success.</p>
                <ul className="mt-5 flex flex-col gap-2 text-sm">
                  {result.winner.reasons.map((reason) => <li key={reason}>• {reason}</li>)}
                </ul>
                <button type="button" onClick={copyShareCard} className="mt-6 rounded-full border border-[#d9a48b] px-4 py-2 text-sm font-semibold text-[#b84b1f]">
                  {copyState === 'copied' ? 'Copied!' : copyState === 'error' ? 'Copy unavailable' : 'Copy share card'}
                </button>
              </div>

              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className="border-b border-border px-6 py-4"><p className="text-sm font-semibold">Side by side</p></div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-6 py-3">Rank</th>
                        <th scope="col" className="px-6 py-3">Agent</th>
                        <th scope="col" className="px-6 py-3">Fit</th>
                        <th scope="col" className="px-6 py-3">Capability</th>
                        <th scope="col" className="px-6 py-3">Relevance</th>
                        <th scope="col" className="px-6 py-3">Identity</th>
                        <th scope="col" className="px-6 py-3">Kymera Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.rankings.map((row) => (
                        <tr key={row.agentId} className="border-t border-border">
                          <td className="px-6 py-4 font-semibold">#{row.rank}</td>
                          <td className="px-6 py-4 font-medium">{row.name}</td>
                          <td className="px-6 py-4 text-primary">{row.score}/100</td>
                          <td className="px-6 py-4 tabular-nums">{row.capabilityMatch}</td>
                          <td className="px-6 py-4 tabular-nums">{row.taskRelevance}</td>
                          <td className="px-6 py-4 tabular-nums">{row.identityStrength}</td>
                          <td className="px-6 py-4">{row.evaluationScore === null ? <span className="text-muted-foreground">excluded</span> : row.evaluationScore}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section className="mt-6 rounded-2xl border border-border bg-card p-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Methodology · {result.methodology.method}</p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{result.methodology.summary}</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-foreground">What it measures</p>
                  <ul className="mt-2 flex flex-col gap-1.5 text-xs leading-5 text-muted-foreground">
                    {result.methodology.measures.map((measure) => (
                      <li key={measure.id}><strong className="text-foreground">{measure.label}</strong> ({Math.round(measure.weight * 100)}%) — {measure.describes}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-foreground">What it does not measure</p>
                  <ul className="mt-2 flex flex-col gap-1.5 text-xs leading-5 text-muted-foreground">
                    {result.methodology.doesNotMeasure.map((item) => <li key={item}>• {item}</li>)}
                  </ul>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  )
}
