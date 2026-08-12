'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import { AgentCard, EmptyState } from '@/components/agent-card'
import { categories, type Agent } from '@/lib/kymera'

type Result = Agent & { matchScore?: number; reasons?: string[]; evaluation?: string }

export function IntelligentDiscover({ initialAgents }: { initialAgents: Agent[] }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>(initialAgents)
  const [intent, setIntent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [category, setCategory] = useState<(typeof categories)[number]>('All')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!query.trim()) { setResults(initialAgents); setIntent(null); return }
    setLoading(true)
    try {
      const response = await fetch('/api/agents/discover', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, limit: 10 }) })
      const data = await response.json()
      if (response.ok) { setResults(data.results); setIntent(data.intent?.mode === 'task' ? 'Task search' : 'Browse search') }
    } finally { setLoading(false) }
  }

  const visible = results.filter((agent) => category === 'All' || agent.category === category)
  return <div className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">
    <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end"><div><p className="text-sm font-medium text-[#e95d25]">Marketplace</p><h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em] md:text-5xl">Discover agents.</h1><p className="mt-3 max-w-xl text-base leading-7 text-[#77736c]">Describe what you need in plain language. Kymera ranks indexed agents by capabilities, protocol support, metadata quality, and evaluated performance.</p></div><div className="text-sm text-[#858078]">{visible.length} agents available</div></div>
    <form onSubmit={submit} className="mt-10 flex gap-3 rounded-2xl border border-[#e9e7e2] bg-white p-3"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#aaa49c]" size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find an agent for low-risk yield monitoring..." className="h-11 w-full rounded-xl bg-[#fafaf9] pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-[#ffe1d3]"/></div><button disabled={loading} className="rounded-xl bg-[#e95d25] px-5 text-sm font-semibold text-white disabled:opacity-60">{loading ? 'Searching...' : 'Search'}</button></form>
    <div className="mt-3 flex flex-wrap items-center gap-2">{categories.map((item) => <button key={item} onClick={() => setCategory(item)} className={`rounded-lg px-3 py-2 text-xs font-medium ${category === item ? 'bg-[#fff1eb] text-[#c84c1f]' : 'text-[#77736c] hover:bg-[#f3f1ed]'}`}>{item}</button>)}{intent && <span className="ml-auto text-xs text-[#858078]">{intent} · transparent ranking</span>}</div>
    <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{visible.map((agent) => <div key={agent.id}><AgentCard agent={agent}/>{agent.reasons?.length ? <div className="mt-2 rounded-xl bg-[#fffaf7] px-4 py-3 text-xs text-[#77736c]"><span className="font-medium text-[#c84c1f]">Why it matched:</span> {agent.reasons.join(' · ')}{agent.evaluation === 'Not yet evaluated' && <span className="mt-1 block">Performance: Not yet evaluated</span>}</div> : null}</div>)}</div>
    {!visible.length && <EmptyState query={query}/>} 
  </div>
}
