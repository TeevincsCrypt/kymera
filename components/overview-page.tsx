import Link from 'next/link'
import { AlertTriangle, ArrowRight, CircleDot, ShieldCheck, Sparkles, Trophy } from 'lucide-react'
import { AgentCard } from '@/components/agent-card'
import { CatalogBootstrap } from '@/components/catalog-bootstrap'
import type { Agent } from '@/lib/kymera'

export function OverviewPage({
  agents,
  totalAgents,
  evaluatedCount,
  erc8004Count,
  categories,
  databaseError,
}: {
  agents: Agent[]
  totalAgents: number
  evaluatedCount: number
  erc8004Count: number
  categories: Array<{ category: string; count: number }>
  databaseError: string | null
}) {
  const scored = agents.filter((agent) => agent.score !== null)
  const averageScore = scored.length ? Math.round(scored.reduce((sum, agent) => sum + (agent.score ?? 0), 0) / scored.length) : null
  const empty = totalAgents === 0

  return (
    <main>
      <section className="border-b border-border bg-card">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 md:grid-cols-[1.08fr_.92fr] md:items-center md:px-8 md:py-24">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-accent bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground">
              <Sparkles size={13} aria-hidden /> Execution control for on-chain agents
            </div>
            <h1 className="mt-6 max-w-2xl text-5xl font-semibold leading-[1.03] tracking-[-0.055em] md:text-7xl">
              Every BNB Chain agent, in one place.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground md:text-lg">
              Finding an agent today means digging through threads and repos. Kymera indexes the ERC-8004 registry, scores every agent on evidence you can inspect, and puts each on-chain action through one Guard — contract, method, and spending limits enforced before your wallet opens.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/discover" className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90">
                Browse the marketplace <ArrowRight size={16} aria-hidden />
              </Link>
              <Link href="/arena" className="flex items-center gap-2 rounded-xl border border-border px-5 py-3 text-sm font-semibold hover:bg-background">
                <Trophy size={16} aria-hidden /> Compare agents
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-2"><ShieldCheck size={14} className="text-[#138a61]" aria-hidden /> Every transaction Guard-checked</span>
              <span className="flex items-center gap-2"><CircleDot size={14} className="text-primary" aria-hidden /> BNB Smart Chain</span>
              <span className="flex items-center gap-2">Non-custodial — you sign everything</span>
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-background p-5 shadow-sm md:p-7">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">Live catalog</p>
                <p className="mt-1 text-sm font-semibold">Indexed agent network</p>
              </div>
              {databaseError ? (
                <span className="flex items-center gap-1.5 text-xs text-destructive"><AlertTriangle size={13} aria-hidden /> Unavailable</span>
              ) : (
                <span className="flex items-center gap-2 text-xs text-[#138a61]"><span className="size-2 rounded-full bg-current" aria-hidden />Live</span>
              )}
            </div>

            {databaseError ? (
              <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-sm font-medium text-destructive">The catalog could not be read</p>
                <p className="mt-1.5 font-mono text-[11px] leading-5 text-destructive/80">{databaseError}</p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  These figures come from the live database, so nothing is shown rather than a placeholder number.
                </p>
              </div>
            ) : (
              <>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <Signal label="Indexed agents" value={totalAgents.toLocaleString()} />
                  <Signal label="ERC-8004 identities" value={erc8004Count.toLocaleString()} />
                  <Signal label="Evaluated" value={evaluatedCount.toLocaleString()} />
                  <Signal label="Average score" value={averageScore === null ? '—' : String(averageScore)} />
                </div>
                {categories.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {categories.slice(0, 8).map((row) => (
                      <Link key={row.category} href={`/discover?category=${encodeURIComponent(row.category)}`} className="rounded-lg bg-muted px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary">
                        {row.category} <span className="tabular-nums opacity-70">{row.count.toLocaleString()}</span>
                      </Link>
                    ))}
                  </div>
                )}
                <p className="mt-5 text-xs leading-5 text-muted-foreground">
                  Counted live from the connected database. Agents Kymera lacks evidence to score are reported unevaluated, never given a default score.
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      {(empty || databaseError) && (
        <section className="mx-auto max-w-7xl px-5 pt-10 md:px-8">
          <CatalogBootstrap />
        </section>
      )}

      {!empty && (
        <section className="mx-auto max-w-7xl px-5 py-14 md:px-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-primary">Highest scoring</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">Agents with the strongest evidence.</h2>
            </div>
            <Link href="/discover" className="hidden items-center gap-1 text-sm font-semibold text-primary sm:flex">View all <ArrowRight size={15} aria-hidden /></Link>
          </div>
          <div className="mt-7 grid gap-5 lg:grid-cols-3">{agents.map((agent) => <AgentCard key={agent.id} agent={agent} />)}</div>
        </section>
      )}
    </main>
  )
}

function Signal({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 truncate text-xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}
