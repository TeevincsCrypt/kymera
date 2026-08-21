'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Info, Loader2, Search } from 'lucide-react'
import { AgentCard } from '@/components/agent-card'
import { CatalogBootstrap } from '@/components/catalog-bootstrap'
import type { Agent } from '@/lib/kymera'

type Result = Agent & { matchScore?: number; reasons?: string[] }
export type CategoryCount = { category: string; count: number }

export function IntelligentDiscover({
  initialAgents,
  categories,
  catalogTotal,
  initialCategory,
  databaseError,
}: {
  initialAgents: Agent[]
  categories: CategoryCount[]
  catalogTotal: number
  initialCategory?: string
  databaseError: string | null
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>(initialAgents)
  const [category, setCategory] = useState<string>(initialCategory ?? 'All')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fellBack, setFellBack] = useState(false)
  const [searched, setSearched] = useState(false)

  const runSearch = useCallback(async (text: string, cat: string) => {
    setLoading(true); setError(''); setFellBack(false)
    try {
      // A category click with no text is still a query — send the category name so the
      // server filters the whole catalog, not just the rows already on screen.
      const effective = text.trim() || (cat !== 'All' ? cat : '')
      if (!effective) {
        const response = await fetch(`/api/agents?pageSize=24${cat !== 'All' ? `&category=${encodeURIComponent(cat)}` : ''}`, { cache: 'no-store' })
        const data = await response.json()
        if (!response.ok) { setError(data.error || 'Could not load agents.'); return }
        setResults(data.items || [])
        setSearched(false)
        return
      }
      const response = await fetch('/api/agents/discover', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: effective, limit: 24 }),
      })
      const data = await response.json()
      if (!response.ok) { setError(data.detail || data.error || 'Search is unavailable.'); return }
      const items: Result[] = data.results || []
      setResults(cat !== 'All' ? items.filter((agent) => agent.category === cat) : items)
      setFellBack(Boolean(data.fellBack))
      setSearched(true)
    } catch {
      setError('Could not reach the search service.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (initialCategory) void runSearch('', initialCategory)
    // Runs once for a category deep-link.
  }, [initialCategory, runSearch])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    void runSearch(query, category)
  }

  function chooseCategory(next: string) {
    setCategory(next)
    void runSearch(query, next)
  }

  const allCategories = ['All', ...categories.map((row) => row.category)]
  const totalShown = results.length

  if (databaseError) {
    return (
      <div className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">
        <h1 className="text-4xl font-semibold tracking-[-0.04em]">Discover agents.</h1>
        <div className="mt-8"><CatalogBootstrap /></div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-medium text-primary">Marketplace</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em] md:text-5xl">Discover agents.</h1>
          <p className="mt-3 max-w-xl text-base leading-7 text-muted-foreground">
            Search {catalogTotal.toLocaleString()} indexed agents by what they do. Every result shows why it matched and what evidence Kymera has about it.
          </p>
        </div>
        <div className="text-sm text-muted-foreground">{totalShown.toLocaleString()} shown</div>
      </div>

      <form onSubmit={submit} className="mt-10 flex gap-3 rounded-2xl border border-border bg-card p-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={17} aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="yield monitoring, security audit, PancakeSwap liquidity…"
            aria-label="Search agents"
            className="h-11 w-full rounded-xl bg-muted pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <button type="submit" disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
          {loading && <Loader2 size={14} className="animate-spin" aria-hidden />}
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info size={12} aria-hidden />
        Deterministic keyword search across the whole catalog — no language model, so the same query always ranks the same way.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {allCategories.map((item) => {
          const count = categories.find((row) => row.category === item)?.count
          return (
            <button
              key={item}
              type="button"
              onClick={() => chooseCategory(item)}
              aria-pressed={category === item}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition ${category === item ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              {item}
              {count !== undefined && <span className="ml-1.5 tabular-nums opacity-60">{count.toLocaleString()}</span>}
              {item === 'All' && <span className="ml-1.5 tabular-nums opacity-60">{catalogTotal.toLocaleString()}</span>}
            </button>
          )
        })}
      </div>

      {error && (
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />{error}
        </p>
      )}

      {fellBack && (
        <p className="mt-4 rounded-lg bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
          Nothing matched that wording exactly, so these are the highest-scoring agents in the catalog instead.
        </p>
      )}

      {catalogTotal === 0 ? (
        <div className="mt-8"><CatalogBootstrap /></div>
      ) : results.length ? (
        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {results.map((agent) => (
            <div key={agent.id} className="flex flex-col">
              <AgentCard agent={agent} />
              {agent.reasons?.length ? (
                <div className="mt-2 rounded-xl bg-muted/50 px-4 py-3 text-xs leading-5 text-muted-foreground">
                  <span className="font-medium text-foreground">Why it matched{typeof agent.matchScore === 'number' ? ` (${agent.matchScore}/100)` : ''}:</span>
                  <ul className="mt-1 list-disc pl-4">{agent.reasons.slice(0, 4).map((reason) => <li key={reason}>{reason}</li>)}</ul>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <p className="text-sm font-medium">No agents in the {category} category yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {searched ? 'Try a broader search, or pick another category.' : 'Index more of the registry to fill this category.'}
          </p>
        </div>
      )}
    </div>
  )
}
