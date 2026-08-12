import type { Prisma } from '@prisma/client'

export type ArenaAgent = Prisma.AgentGetPayload<{ include: { performance: true; capabilityItems: true } }>

export type ArenaRanking = {
  agentId: string
  name: string
  rank: number
  score: number
  evaluated: boolean
  capabilityMatch: number
  taskRelevance: number
  protocolMatch: number
  metadataQuality: number
  evaluationConfidence: number
  reasons: string[]
}

const protocols = ['a2a', 'mcp', 'x402', 'rest', 'graphql']
const categories = ['Trading', 'Analytics', 'Automation', 'Research', 'Infrastructure']

function text(agent: ArenaAgent) {
  return [agent.name, agent.description, agent.category, agent.chain, JSON.stringify(agent.capabilities), JSON.stringify(agent.supportedProtocols)].join(' ').toLowerCase()
}

function tokens(value: string) {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2)
}

function overlap(query: string, value: string) {
  const wanted = new Set(tokens(query))
  const found = tokens(value).filter((token) => wanted.has(token))
  return Math.min(100, found.length * 22)
}

function metadataQuality(agent: ArenaAgent) {
  let score = 0
  if (agent.erc8004TokenId) score += 35
  if (agent.erc8004MetadataUri) score += 25
  if (agent.erc8004MetadataHash) score += 20
  if (agent.ownerAddress) score += 10
  if (agent.endpoint) score += 10
  return score
}

function scoreAgent(agent: ArenaAgent, task: string, index: number): ArenaRanking {
  const haystack = text(agent)
  const capabilityMatch = overlap(task, String(agent.capabilities))
  const taskRelevance = Math.min(100, overlap(task, haystack) + (haystack.includes(agent.category.toLowerCase()) ? 18 : 0))
  const protocolMatch = protocols.some((protocol) => task.toLowerCase().includes(protocol) && haystack.includes(protocol)) ? 100 : 35
  const metadata = metadataQuality(agent)
  const evaluated = Boolean(agent.performance)
  const evaluationConfidence = evaluated ? Math.min(100, 45 + Math.round((agent.performance?.tasksCompleted ?? 0) / 10)) : 0
  const score = Math.round(capabilityMatch * 0.30 + taskRelevance * 0.25 + protocolMatch * 0.15 + metadata * 0.15 + (evaluated ? (agent.performance?.kymeraScore ?? 0) : 0) * 0.10 + evaluationConfidence * 0.05)
  const reasons = [
    capabilityMatch >= 45 ? 'Strong capability overlap' : 'Limited capability overlap',
    taskRelevance >= 45 ? 'Relevant indexed metadata' : 'Partial task relevance',
    agent.erc8004TokenId ? 'ERC-8004 identity verified' : 'Identity metadata incomplete',
    evaluated ? `Kymera score ${Math.round(agent.performance?.kymeraScore ?? 0)}/100` : 'Not yet evaluated',
  ]
  return { agentId: agent.id, name: agent.name, rank: index + 1, score, evaluated, capabilityMatch, taskRelevance, protocolMatch, metadataQuality: metadata, evaluationConfidence, reasons }
}

export function recommendArenaAgents(agents: ArenaAgent[], task: string) {
  return agents.map((agent) => scoreAgent(agent, task, 0)).sort((a, b) => b.score - a.score).map((result, index) => ({ ...result, rank: index + 1 }))
}

export function arenaTaskLabel(task: string) {
  const lower = task.toLowerCase()
  const category = categories.find((item) => lower.includes(item.toLowerCase()))
  return category ?? 'General agent benchmark'
}
