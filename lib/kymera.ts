export type AgentCategory = 'Trading' | 'Research' | 'Operations' | 'Creative' | 'Security' | 'DeFi' | 'Monitoring' | 'Analytics'

export type EvaluationStatus = 'UNEVALUATED' | 'INSUFFICIENT_EVIDENCE' | 'EVALUATED'
export type TrustTier = 'INDEXED' | 'EVALUATED' | 'VETTED'
export type AgentOrigin = 'ERC-8004' | 'Local'

/**
 * The agent shape the UI renders. Note that `score` is nullable on purpose: an agent
 * Kymera has not gathered enough evidence about has no score, and the UI must say so
 * rather than showing a zero.
 */
export type Agent = {
  id: string
  name: string
  symbol: string
  description: string
  category: AgentCategory
  chain: string
  score: number | null
  evaluationStatus: EvaluationStatus
  trustTier: TrustTier
  /** True only when an ERC-8004 registry identity was read for this agent. */
  identityVerified: boolean
  origin: AgentOrigin
  status: 'Live' | 'Beta' | 'Paused'
  accent: string
  tags: string[]
  creator: string
  updated: string
  evaluatedAt: string | null
  /** Real Guard execution counts. Zeroes mean "none yet", never "unknown". */
  executions: { confirmed: number; rejected: number }
}

export const categories = ['All', 'Trading', 'Research', 'Operations', 'Creative', 'Security', 'DeFi', 'Monitoring', 'Analytics'] as const

export const TRUST_TIER_COPY: Record<TrustTier, { label: string; detail: string }> = {
  INDEXED: { label: 'Indexed', detail: 'Found in the agent registry. Kymera has not evaluated it.' },
  EVALUATED: { label: 'Evaluated', detail: 'Kymera gathered enough evidence to produce a score.' },
  VETTED: { label: 'Vetted', detail: 'A human review was recorded for this agent.' },
}

export const EVALUATION_STATUS_COPY: Record<EvaluationStatus, string> = {
  UNEVALUATED: 'Not yet evaluated',
  INSUFFICIENT_EVIDENCE: 'Insufficient evaluation data',
  EVALUATED: 'Evaluated',
}

export function scoreLabel(agent: Pick<Agent, 'score' | 'evaluationStatus'>) {
  return agent.score === null ? EVALUATION_STATUS_COPY[agent.evaluationStatus] : `${agent.score}/100`
}
