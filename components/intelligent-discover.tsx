'use client'

import { useState } from 'react'
import { Info, Search } from 'lucide-react'
import { AgentCard, EmptyState } from '@/components/agent-card'
import { categories, type Agent } from '@/lib/kymera'

type Result = Agent & { matchScore?: number; reasons?: string[] }

export function IntelligentDiscover({ initialAgents }: { initialAgents: Agent[] }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>(initialAgents)
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [category, setCategory] = useState<(typeof categories)[number]>('All')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (!query.trim()) { setResults(initialAgents); setSearched(false); return }
    setLoading(true)
    try {
      const response = await fetch('/api/agents/discover', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, limit: 12 }),
      })
      const data = await response.json()
      if (!response.ok) { setError(data.error || 'Search is unavailable right now.'); return }
      setResults(data.results)
      setSearched(true)
    } catch {
      setError('Could not reach the search service.')
    } finally {
      setLoading(false)
    }
  }

  const visible = results.filter((agent) => category === 'All' || agent.category === category)

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-medium text-primary">Marketplace</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em] md:text-5xl">Discover agents.</h1>
          <p className="mt-3 max-w-xl text-base leading-7 text-muted-foreground">
            Describe what you need. Kymera ranks indexed agents by capability overlap, protocol support, registry identity, and evaluation evidence — and shows you why each one matched.
          </p>
        </div>
        <div className="text-sm text-muted-foreground">{visible.length} agents</div>
      </div>

      <form onSubmit={submit} className="mt-10 flex gap-3 rounded-2xl border border-border bg-card p-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={17} aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="An agent for low-risk yield monitoring on BNB Chain…"
            aria-label="Search agents"
            className="h-11 w-full rounded-xl bg-muted pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <button type="submit" disabled={loading} className="rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info size={12} aria-hidden />
        Search runs a deterministic keyword interpreter — no language model, so the same query always returns the same ranking.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {categories.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setCategory(item)}
            aria-pressed={category === item}
            className={`rounded-lg px-3 py-2 text-xs font-medium ${category === item ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
          >
            {item}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      {visible.length ? (
        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((agent) => (
            <div key={agent.id} className="flex flex-col">
              <AgentCard agent={agent} />
              {agent.reasons?.length ? (
                <div className="mt-2 rounded-xl bg-muted/50 px-4 py-3 text-xs leading-5 text-muted-foreground">
                  <span className="font-medium text-foreground">Why it matched{typeof agent.matchScore === 'number' ? ` (${agent.matchScore}/100)` : ''}:</span>
                  <ul className="mt-1 list-disc pl-4">{agent.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-8"><EmptyState query={searched ? query : ''} /></div>
      )}
    </div>
  )
}
