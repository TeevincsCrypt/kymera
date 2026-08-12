import { prisma } from '@/lib/prisma'
import { interpretQuery, type DiscoveryIntent } from '@/lib/ai/query-interpreter'
import { scoreAgent } from '@/lib/kymera-score'

export type DiscoveryResult = {
  agent: Awaited<ReturnType<typeof prisma.agent.findMany>>[number]
  score: number | null
  matchScore: number
  reasons: string[]
  evaluation: 'Evaluated' | 'Not yet evaluated'
}

function values(agent: { name: string; description: string; category: string; chain: string; capabilities: unknown; supportedProtocols: unknown }) {
  return [agent.name, agent.description, agent.category, agent.chain, ...(Array.isArray(agent.capabilities) ? agent.capabilities.map(String) : []), ...(Array.isArray(agent.supportedProtocols) ? agent.supportedProtocols.map(String) : [])].join(' ').toLowerCase()
}

export async function discoverAgents(query: string, limit = 10) {
  const intent = interpretQuery(query)
  const where = {
    ...(intent.category ? { category: intent.category } : {}),
    ...(intent.chain ? { chain: { contains: intent.chain.replace(' Chain', ''), mode: 'insensitive' as const } } : {}),
  }
  const candidates = await prisma.agent.findMany({ where, take: 500, include: { performance: true, capabilityItems: true }, orderBy: { updatedAt: 'desc' } })
  return { intent, results: rankCandidates(candidates, intent, limit) }
}

function rankCandidates(candidates: Awaited<ReturnType<typeof prisma.agent.findMany>> extends infer _T ? any[] : never, intent: DiscoveryIntent, limit: number): DiscoveryResult[] {
  return candidates.map((agent) => {
    const text = values(agent)
    const hits = intent.terms.filter((term) => text.includes(term))
    const capabilityHits = intent.capabilities.filter((term) => text.includes(term))
    const protocolHits = intent.protocols.filter((term) => text.includes(term.toLowerCase()))
    const performance = scoreAgent(agent)
    const matchScore = Math.min(100, hits.length * 12 + capabilityHits.length * 10 + protocolHits.length * 10 + (intent.category && agent.category === intent.category ? 25 : 0) + (intent.chain && text.includes(intent.chain.toLowerCase()) ? 15 : 0) + (performance.score ?? 0) * 0.25)
    const reasons = [...capabilityHits.slice(0, 2).map((hit) => `Matches ${hit}`), ...protocolHits.map((hit) => `Supports ${hit}`)]
    if (intent.category && agent.category === intent.category) reasons.push(`${intent.category} specialist`)
    if (!reasons.length && intent.mode === 'browse') reasons.push('Available in the Kymera marketplace')
    return { agent, score: performance.score, matchScore: Math.round(matchScore), reasons, evaluation: performance.label }
  }).sort((a, b) => b.matchScore - a.matchScore).slice(0, limit)
}
