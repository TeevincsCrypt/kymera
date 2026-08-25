/**
 * Kymera Arena — task-fit comparison.
 *
 * IMPORTANT, and surfaced in the UI: the Arena does NOT execute agents. Kymera has no
 * agent runtime, so claiming measured accuracy or latency would be fabricated. What
 * the Arena does is compare indexed evidence against a task description using a
 * published, deterministic formula, and show its work. Re-running the same task over
 * the same agents always produces the same ranking.
 */

import type { AgentRecord } from '@/lib/agent-repository'

export const ARENA_METHOD = 'kymera-arena-v2'

export const ARENA_METHODOLOGY = {
  method: ARENA_METHOD,
  executesAgents: false,
  summary: 'Compares registry-indexed evidence against your task description. No agent code is executed and no performance is measured.',
  measures: [
    { id: 'capabilityMatch', weight: 0.35, label: 'Capability match', describes: 'Overlap between your task wording and the agent’s declared capabilities.' },
    { id: 'taskRelevance', weight: 0.25, label: 'Task relevance', describes: 'Overlap with the agent’s full indexed profile, category, and chain.' },
    { id: 'identityStrength', weight: 0.20, label: 'Identity strength', describes: 'How completely the agent’s ERC-8004 registry identity resolves.' },
    { id: 'evaluationScore', weight: 0.20, label: 'Kymera evaluation', describes: 'The agent’s recorded Kymera Score, counted only when one exists.' },
  ],
  doesNotMeasure: ['Execution accuracy', 'Latency', 'Cost per task', 'Historical success rate against this specific task'],
} as const

export type ArenaRanking = {
  agentId: string
  name: string
  rank: number
  score: number
  capabilityMatch: number
  taskRelevance: number
  identityStrength: number
  evaluationScore: number | null
  evaluated: boolean
  /** Weights actually applied, after renormalising around any missing evidence. */
  appliedWeights: Record<string, number>
  reasons: string[]
}

function tokens(value: string) {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2)
}

function overlapScore(task: string, value: string) {
  const wanted = new Set(tokens(task))
  if (!wanted.size) return 0
  const found = new Set(tokens(value).filter((token) => wanted.has(token)))
  return Math.min(100, found.size * 22)
}

function identityStrength(agent: AgentRecord) {
  let score = 0
  if (agent.erc8004TokenId) score += 35
  if (agent.erc8004RegistryAddress) score += 20
  if (agent.erc8004MetadataUri) score += 20
  if (agent.erc8004MetadataHash) score += 15
  if (agent.endpoint) score += 10
  return Math.min(100, score)
}

function profileText(agent: AgentRecord) {
  return [
    agent.name,
    agent.description,
    agent.category,
    agent.chain,
    ...agent.capabilityItems.map((item) => item.name),
    ...(Array.isArray(agent.capabilities) ? agent.capabilities.map(String) : []),
    ...(Array.isArray(agent.supportedProtocols) ? agent.supportedProtocols.map(String) : []),
  ].join(' ')
}

function scoreOne(agent: AgentRecord, task: string): Omit<ArenaRanking, 'rank'> {
  const capabilityText = [...agent.capabilityItems.map((item) => item.name), ...(Array.isArray(agent.capabilities) ? agent.capabilities.map(String) : [])].join(' ')
  const profile = profileText(agent)

  const capabilityMatch = overlapScore(task, capabilityText)
  const lowerTask = task.toLowerCase()
  const taskRelevance = Math.min(
    100,
    overlapScore(task, profile) +
      (lowerTask.includes(agent.category.toLowerCase()) ? 18 : 0) +
      (lowerTask.includes(agent.chain.toLowerCase()) ? 12 : 0),
  )
  const identity = identityStrength(agent)
  const evaluation = agent.kymeraScore

  // Renormalise so an unevaluated agent is neither given a zero nor flattered.
  const parts: Array<{ id: string; weight: number; value: number }> = [
    { id: 'capabilityMatch', weight: 0.35, value: capabilityMatch },
    { id: 'taskRelevance', weight: 0.25, value: taskRelevance },
    { id: 'identityStrength', weight: 0.2, value: identity },
  ]
  if (evaluation !== null) parts.push({ id: 'evaluationScore', weight: 0.2, value: evaluation })

  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0)
  const score = Math.round(parts.reduce((sum, part) => sum + part.value * part.weight, 0) / totalWeight)
  const appliedWeights = Object.fromEntries(parts.map((part) => [part.id, Math.round((part.weight / totalWeight) * 100)]))

  const reasons = [
    capabilityMatch >= 45 ? `Strong capability overlap (${capabilityMatch}/100)` : `Limited capability overlap (${capabilityMatch}/100)`,
    taskRelevance >= 45 ? `Relevant indexed profile (${taskRelevance}/100)` : `Partial profile relevance (${taskRelevance}/100)`,
    agent.erc8004TokenId ? `ERC-8004 identity resolves (${identity}/100)` : `No ERC-8004 identity (${identity}/100)`,
    evaluation !== null ? `Kymera Score ${evaluation}/100 included` : 'No Kymera Score yet — this measure was excluded, not zeroed',
  ]

  return {
    agentId: agent.id,
    name: agent.name,
    score,
    capabilityMatch,
    taskRelevance,
    identityStrength: identity,
    evaluationScore: evaluation,
    evaluated: evaluation !== null,
    appliedWeights,
    reasons,
  }
}

export function recommendArenaAgents(agents: AgentRecord[], task: string): ArenaRanking[] {
  return agents
    .map((agent) => scoreOne(agent, task))
    // Deterministic tiebreak so identical scores always order the same way.
    .sort((a, b) => b.score - a.score || a.agentId.localeCompare(b.agentId))
    .map((result, index) => ({ ...result, rank: index + 1 }))
}

export function arenaTaskLabel(task: string) {
  const categories = ['Trading', 'Research', 'Operations', 'Creative', 'Security', 'DeFi', 'Monitoring', 'Analytics']
  const lower = task.toLowerCase()
  return categories.find((item) => lower.includes(item.toLowerCase())) ?? 'General agent comparison'
}
