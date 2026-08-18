import type { Prisma } from '@prisma/client'

export type ArenaAgent = Prisma.AgentGetPayload<{ include: { performance: true; capabilityItems: true; benchmarkResults: { select: { score: true } } } }>

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
const categories = ['Trading', 'Research', 'Operations', 'Creative', 'Security', 'DeFi', 'Monitoring', 'Analytics']

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
  const capabilityText = [...agent.capabilityItems.map((item) => item.name), ...(Array.isArray(agent.capabilities) ? agent.capabilities.map(String) : [])].join(' ')
  const capabilityMatch = overlap(task, capabilityText)
  const taskRelevance = Math.min(100, overlap(task, haystack) + (haystack.includes(agent.category.toLowerCase()) ? 18 : 0) + (haystack.includes(agent.chain.toLowerCase()) && task.toLowerCase().includes(agent.chain.toLowerCase()) ? 12 : 0))
  const requestedProtocols = protocols.filter((protocol) => task.toLowerCase().includes(protocol))
  const protocolMatch = requestedProtocols.length ? Math.round(requestedProtocols.filter((protocol) => haystack.includes(protocol)).length / requestedProtocols.length * 100) : Math.min(70, 25 + (Array.isArray(agent.supportedProtocols) ? agent.supportedProtocols.length : 0) * 15)
  const metadata = metadataQuality(agent)
  const persistedScores = agent.benchmarkResults.map((result) => result.score).filter((score): score is number => typeof score === 'number')
  const persistedBenchmark = persistedScores.length ? Math.round(persistedScores.reduce((sum, score) => sum + score, 0) / persistedScores.length) : null
  const evaluated = Boolean(agent.performance || persistedBenchmark !== null)
  const evaluationConfidence = evaluated ? Math.min(100, 45 + Math.round((agent.performance?.tasksCompleted ?? persistedScores.length * 5) / 10)) : 0
  const evidenceScore = agent.performance?.kymeraScore ?? persistedBenchmark ?? 0
  const score = Math.round(capabilityMatch * 0.30 + taskRelevance * 0.25 + protocolMatch * 0.15 + metadata * 0.15 + evidenceScore * 0.10 + evaluationConfidence * 0.05)
  const reasons = [
    capabilityMatch >= 45 ? 'Strong capability overlap' : 'Limited capability overlap',
    taskRelevance >= 45 ? 'Relevant indexed metadata' : 'Partial task relevance',
    agent.erc8004TokenId ? 'ERC-8004 identity verified' : 'Identity metadata incomplete',
    evaluated ? `Persisted evaluation evidence ${Math.round(evidenceScore)}/100` : 'Not yet evaluated',
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
