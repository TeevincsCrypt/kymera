import Link from 'next/link'
import { ArrowRight, CircleDot, ShieldCheck, Sparkles, Trophy } from 'lucide-react'
import { AgentCard } from '@/components/agent-card'
import type { Agent } from '@/lib/kymera'

export function OverviewPage({ agents, totalAgents, evaluatedCount }: { agents: Agent[]; totalAgents: number; evaluatedCount: number }) {
  const scored = agents.filter((agent) => agent.score !== null)
  const averageScore = scored.length ? Math.round(scored.reduce((sum, agent) => sum + (agent.score ?? 0), 0) / scored.length) : null
  const topAgents = agents.slice(0, 3)

  return (
    <main>
      <section className="border-b border-border bg-card">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 md:grid-cols-[1.08fr_.92fr] md:items-center md:px-8 md:py-24">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-accent bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground">
              <Sparkles size={13} aria-hidden /> Execution control for on-chain agents
            </div>
            <h1 className="mt-6 max-w-2xl text-5xl font-semibold leading-[1.03] tracking-[-0.055em] md:text-7xl">
              Agents can act on-chain. You decide how far.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground md:text-lg">
              Kymera indexes BNB Chain agents, scores them on evidence you can inspect, and puts every on-chain action they request through one Guard — contract, method, and spending limits enforced before your wallet ever opens.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/discover" className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90">
                Explore agents <ArrowRight size={16} aria-hidden />
              </Link>
              <Link href="/arena" className="flex items-center gap-2 rounded-xl border border-border px-5 py-3 text-sm font-semibold hover:bg-background">
                <Trophy size={16} aria-hidden /> Compare agents
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-2"><ShieldCheck size={14} className="text-[#138a61]" aria-hidden /> Every transaction Guard-checked</span>
              <span className="flex items-center gap-2"><CircleDot size={14} className="text-primary" aria-hidden /> BNB Smart Chain Testnet</span>
              <span className="flex items-center gap-2">Non-custodial — you sign everything</span>
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-background p-5 shadow-sm md:p-7">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">Catalog</p>
                <p className="mt-1 text-sm font-semibold">Indexed agent network</p>
              </div>
              <span className="flex items-center gap-2 text-xs text-[#138a61]"><span className="size-2 rounded-full bg-current" aria-hidden />Live</span>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Signal label="Indexed agents" value={totalAgents.toLocaleString()} />
              <Signal label="Evaluated" value={evaluatedCount.toLocaleString()} />
              <Signal label="Average score" value={averageScore === null ? 'No scores yet' : String(averageScore)} />
              <Signal label="Unevaluated" value={(totalAgents - evaluatedCount).toLocaleString()} />
            </div>
            <p className="mt-5 text-xs leading-5 text-muted-foreground">
              Counts come from the connected database. Agents Kymera lacks evidence to score are reported as unevaluated rather than given a default score.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 md:px-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-primary">Highest scoring</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Agents with the strongest evidence.</h2>
          </div>
          <Link href="/discover" className="hidden items-center gap-1 text-sm font-semibold text-primary sm:flex">View all <ArrowRight size={15} aria-hidden /></Link>
        </div>
        {topAgents.length ? (
          <div className="mt-7 grid gap-5 lg:grid-cols-3">{topAgents.map((agent) => <AgentCard key={agent.id} agent={agent} />)}</div>
        ) : (
          <div className="mt-7 rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
            <p className="text-sm font-medium">No agents indexed yet.</p>
            <p className="mt-2 text-sm text-muted-foreground">Sign in and run an ERC-8004 sync from the workspace to populate the catalog.</p>
          </div>
        )}
      </section>
    </main>
  )
}

function Signal({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 truncate text-xl font-semibold">{value}</p>
    </div>
  )
}
