'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowRight, HelpCircle, Play, ShieldCheck } from 'lucide-react'
import { GuardSessionDialog } from '@/components/guard-session-dialog'
import { HireAgentDialog } from '@/components/hire-agent-dialog'
import { TrustBadge } from '@/components/agent-card'
import { TRUST_TIER_COPY, type Agent } from '@/lib/kymera'

export type EvaluationComponent = { id: string; label: string; weight: number; value: number | null; evidence: string }
export type AgentEvaluationView = {
  score: number | null
  sufficientEvidence: boolean
  evidenceCount: number
  method: string
  components: EvaluationComponent[]
  explanation: string[]
  createdAt: string
} | null

const Shell = ({ eyebrow, title, copy, children }: { eyebrow: string; title: string; copy: string; children: React.ReactNode }) => (
  <div className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">
    <div>
      <p className="text-sm font-medium text-primary">{eyebrow}</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-[-.045em] md:text-5xl">{title}</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">{copy}</p>
    </div>
    {children}
  </div>
)

export function AgentDetailPage({ agent, evaluation }: { agent: Agent | null; evaluation: AgentEvaluationView }) {
  const [sessionId, setSessionId] = useState<string | null>(null)

  if (!agent) {
    return (
      <Shell eyebrow="Agent profile" title="Agent not found" copy="This agent is not in the Kymera index.">
        <div className="mt-10 rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">Return to Discover and choose another agent.</p>
          <Link href="/discover" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">Browse agents <ArrowRight size={15} aria-hidden /></Link>
        </div>
      </Shell>
    )
  }

  return (
    <Shell eyebrow="Agent profile" title={agent.name} copy={agent.description}>
      <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_.6fr]">
        <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="flex items-center gap-4">
              <div className="flex size-16 items-center justify-center rounded-2xl text-xl font-bold text-white" style={{ background: agent.accent }}>{agent.symbol}</div>
              <div>
                <h2 className="text-2xl font-semibold">{agent.name}</h2>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{agent.creator}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <TrustBadge agent={agent} />
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{agent.origin === 'ERC-8004' ? 'ERC-8004 registry' : 'Local catalog entry'}</span>
                </div>
              </div>
            </div>
            <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-medium">{agent.category}</span>
          </div>

          <p className="mt-4 text-xs leading-5 text-muted-foreground">{TRUST_TIER_COPY[agent.trustTier].detail}</p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <Stat label="Kymera Score" value={agent.score === null ? '—' : `${agent.score}/100`} note={agent.score === null ? (agent.evaluationStatus === 'INSUFFICIENT_EVIDENCE' ? 'Insufficient evidence' : 'Not yet evaluated') : `Evaluated ${agent.evaluatedAt ? new Date(agent.evaluatedAt).toLocaleDateString() : ''}`} />
            <Stat label="Confirmed on-chain" value={String(agent.executions.confirmed)} note="Guard-authorized transactions that succeeded" />
            <Stat label="Blocked by Guard" value={String(agent.executions.rejected)} note="Requests Guard refused" />
          </div>

          <section className="mt-8 border-t border-border pt-6">
            <h3 className="font-semibold">How this score was produced</h3>
            {evaluation ? (
              <>
                <p className="mt-2 text-xs text-muted-foreground">
                  Method <code className="rounded bg-muted px-1">{evaluation.method}</code> · {evaluation.evidenceCount} evidence signals · recorded {new Date(evaluation.createdAt).toLocaleString()}
                </p>
                <div className="mt-4 flex flex-col gap-3">
                  {evaluation.components.map((component) => (
                    <div key={component.id} className="rounded-xl border border-border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium">{component.label}</span>
                        <span className={`font-mono text-xs ${component.value === null ? 'text-muted-foreground' : 'text-foreground'}`}>
                          {component.value === null ? 'no evidence' : `${component.value}/100`}
                        </span>
                      </div>
                      {component.value !== null && (
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${component.value}%` }} />
                        </div>
                      )}
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">{component.evidence}</p>
                    </div>
                  ))}
                </div>
                {!evaluation.sufficientEvidence && (
                  <p className="mt-4 rounded-xl border border-dashed border-border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
                    Kymera did not have enough evidence to publish a score for this agent. It reports that rather than estimating one.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                <HelpCircle size={15} className="mt-0.5 shrink-0" aria-hidden />
                No evaluation has been recorded for this agent yet.
              </p>
            )}
          </section>

          <section className="mt-8 border-t border-border pt-6">
            <h3 className="font-semibold">Declared capabilities</h3>
            {agent.tags.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {agent.tags.map((tag) => <span key={tag} className="rounded-lg border border-border px-3 py-2 text-xs" >{tag}</span>)}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">This agent published no capability metadata.</p>
            )}
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              These are capabilities the agent declares about itself in the registry. Kymera indexes and scores them but does not execute the agent, so they are claims, not verified behaviour.
            </p>
          </section>
        </div>

        <div className="h-fit rounded-2xl border border-border bg-card p-6">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Put it to work</p>
          <h3 className="mt-3 text-xl font-semibold">Hire {agent.name}.</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Hiring is read-only: the agent can look at data and produce analysis, nothing more. On-chain execution is a separate grant you make deliberately.
          </p>

          <div className="mt-5">
            <HireAgentDialog agent={agent} />
          </div>

          <div className="mt-6 border-t border-border pt-5">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Step 2 · optional</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              To let this agent request transactions, grant a Guard session. It defines exactly which contracts and methods it may touch and how much it can spend.
            </p>
            <div className="mt-4">
              <GuardSessionDialog agent={agent} onCreated={(session) => setSessionId(session.id)} />
            </div>
          </div>

          {sessionId && (
            <p className="mt-3 rounded-lg bg-[#e8f6f0] px-3 py-2 text-xs text-[#138a61]">
              Guard session created. Manage or revoke it in <Link href="/dashboard" className="underline">your workspace</Link>.
            </p>
          )}

          <Link href={`/simulate?agentId=${encodeURIComponent(agent.id)}`} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold">
            <Play size={15} aria-hidden /> Dry-run Guard
          </Link>

          <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden /> Permissions are revocable at any time, and revoking cancels outstanding authorizations immediately.
          </p>
        </div>
      </div>
    </Shell>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl bg-muted/50 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{note}</p>
    </div>
  )
}
