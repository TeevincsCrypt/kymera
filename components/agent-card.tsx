import Link from 'next/link'
import { ArrowUpRight, BadgeCheck, HelpCircle, Star } from 'lucide-react'
import { TRUST_TIER_COPY, type Agent } from '@/lib/kymera'

/**
 * Score dial. An agent with no score renders as an explicit "not evaluated" state
 * rather than an empty ring, so a missing measurement never reads as a low one.
 */
export function Score({ score, status }: { score: number | null; status: Agent['evaluationStatus'] }) {
  if (score === null) {
    return (
      <div className="flex items-center gap-2" title={status === 'INSUFFICIENT_EVIDENCE' ? 'Not enough evidence to score this agent' : 'Kymera has not evaluated this agent yet'}>
        <div className="flex size-10 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground">
          <HelpCircle size={15} aria-hidden />
        </div>
        <span className="max-w-20 text-[10px] leading-3 text-muted-foreground">{status === 'INSUFFICIENT_EVIDENCE' ? 'Not enough evidence' : 'Not evaluated'}</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <div className="relative size-10">
        <svg className="size-10 -rotate-90" viewBox="0 0 36 36" aria-hidden>
          <circle cx="18" cy="18" r="15" fill="none" stroke="var(--border)" strokeWidth="3" />
          <circle cx="18" cy="18" r="15" fill="none" stroke="var(--primary)" strokeWidth="3" strokeDasharray={`${score} 100`} pathLength="100" strokeLinecap="round" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold">{score}</span>
      </div>
      <span className="text-xs text-muted-foreground">Kymera Score</span>
    </div>
  )
}

export function TrustBadge({ agent }: { agent: Agent }) {
  const copy = TRUST_TIER_COPY[agent.trustTier]
  const tone = agent.trustTier === 'VETTED' ? 'bg-[#e8f6f0] text-[#138a61]' : agent.trustTier === 'EVALUATED' ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-muted-foreground'
  return (
    <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${tone}`} title={copy.detail}>
      {agent.trustTier === 'VETTED' && <BadgeCheck size={10} aria-hidden />}
      {copy.label}
    </span>
  )
}

export function AgentCard({ agent, selected, onSelect }: { agent: Agent; selected?: boolean; onSelect?: (id: string) => void }) {
  return (
    <article className={`group flex flex-col rounded-2xl border bg-card p-5 transition hover:-translate-y-0.5 hover:border-[#d7d2cb] hover:shadow-[0_12px_30px_rgba(45,35,25,0.06)] ${selected ? 'border-primary ring-2 ring-accent' : 'border-border'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white" style={{ background: agent.accent }}>{agent.symbol}</div>
          <div className="min-w-0">
            <h3 className="truncate font-semibold tracking-tight">{agent.name}</h3>
            <p className="truncate font-mono text-[10px] text-muted-foreground" title={agent.creator}>{agent.creator}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <TrustBadge agent={agent} />
              {agent.identityVerified && (
                <span className="inline-flex w-fit rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground" title="An ERC-8004 registry identity was read for this agent. This is an identity check, not a safety audit.">
                  ERC-8004 identity
                </span>
              )}
            </div>
          </div>
        </div>
        <Score score={agent.score} status={agent.evaluationStatus} />
      </div>

      <p className="mt-5 min-h-12 text-sm leading-6 text-muted-foreground">{agent.description}</p>

      {agent.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {agent.tags.slice(0, 6).map((tag) => <span key={tag} className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">{tag}</span>)}
        </div>
      )}

      <div className="mt-5 grid grid-cols-3 divide-x divide-[#eeeae5] border-y border-border py-3">
        <Metric label="Origin" value={agent.origin} />
        <Metric label="Confirmed" value={String(agent.executions.confirmed)} title="Transactions this agent's sessions completed on-chain through Guard" />
        <Metric label="Blocked" value={String(agent.executions.rejected)} title="Action requests Kymera Guard refused" />
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <span className={`flex items-center gap-1.5 text-xs ${agent.status === 'Live' ? 'text-[#138a61]' : 'text-[#a07627]'}`}>
          <span className="size-1.5 rounded-full bg-current" aria-hidden />{agent.status}
        </span>
        <div className="flex gap-2">
          {onSelect && (
            <button type="button" onClick={() => onSelect(agent.id)} className="rounded-lg border border-[#e2ded8] px-3 py-2 text-xs font-medium hover:bg-[#fafaf9]">
              {selected ? 'Selected' : 'Compare'}
            </button>
          )}
          <Link href={`/agents/${agent.id}`} className="flex items-center gap-1 rounded-lg bg-[#171717] px-3 py-2 text-xs font-medium text-white hover:bg-[#333]">
            View <ArrowUpRight size={13} aria-hidden />
          </Link>
        </div>
      </div>
    </article>
  )
}

function Metric({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="px-2 first:pl-0 last:pr-0" title={title}>
      <div className="text-[10px] uppercase tracking-wider text-[#aaa49c]">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold">{value}</div>
    </div>
  )
}

export function EmptyState({ query }: { query: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#d9d4cd] bg-card px-6 py-16 text-center">
      <Star className="mx-auto text-[#e95d25]" size={22} aria-hidden />
      <h3 className="mt-3 font-semibold">No agents found</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {query ? `Nothing in the index matches “${query}”.` : 'The catalog is empty. Sync the ERC-8004 registry to populate it.'}
      </p>
    </div>
  )
}
