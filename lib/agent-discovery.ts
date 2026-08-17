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

function values(agent: { name: string; description: string; category: string; chain: string; capabilities: unknown; supportedProtocols: unknown; capabilityItems?: Array<{ name: string }> }) {
  return [agent.name, agent.description, agent.category, agent.chain, ...(agent.capabilityItems || []).map((item) => item.name), ...(Array.isArray(agent.capabilities) ? agent.capabilities.map(String) : []), ...(Array.isArray(agent.supportedProtocols) ? agent.supportedProtocols.map(String) : [])].join(' ').toLowerCase()
}

export async function discoverAgents(query: string, limit = 10) {
  const intent = interpretQuery(query)
  const where = {
    ...(intent.chain ? { chain: { contains: intent.chain.replace(' Chain', ''), mode: 'insensitive' as const } } : {}),
  }
  const candidates = await prisma.agent.findMany({ where, take: 500, include: { performance: true, capabilityItems: true, benchmarkResults: { select: { score: true } } }, orderBy: { updatedAt: 'desc' } })
  const filtered = candidates.filter((agent) => {
    const text = values(agent)
    const relevant = [...intent.terms, ...intent.capabilities, ...intent.protocols].some((term) => text.includes(term.toLowerCase()))
    if (intent.mode === 'task' && !relevant) return false
    if (intent.risk === 'low' && !/(low risk|safe|risk management|risk|guard|monitor|monitoring|alert|analytics)/.test(text)) return false
    if (intent.risk === 'high' && !/(high risk|aggressive|trading)/.test(text)) return false
    return true
  })
  return { intent, results: rankCandidates(filtered, intent, limit) }
}

function rankCandidates(candidates: Awaited<ReturnType<typeof prisma.agent.findMany>> extends infer _T ? any[] : never, intent: DiscoveryIntent, limit: number): DiscoveryResult[] {
  return candidates.map((agent) => {
    const text = values(agent)
    const hits = intent.terms.filter((term) => text.includes(term))
    const capabilityHits = intent.capabilities.filter((term) => text.includes(term))
    const protocolHits = intent.protocols.filter((term) => text.includes(term.toLowerCase()))
    const pancakeEvidence = intent.capabilities.includes('pancakeswap') && ['pancakeswap', 'pancake swap', 'liquidity', 'amm', 'pool'].some((term) => text.includes(term))
    const performance = scoreAgent(agent)
    const matchScore = Math.min(100, hits.length * 12 + capabilityHits.length * 10 + protocolHits.length * 10 + (pancakeEvidence ? 24 : 0) + (intent.category && agent.category === intent.category ? 25 : 0) + (intent.chain && text.includes(intent.chain.toLowerCase()) ? 15 : 0) + (performance.score ?? 0) * 0.25)
    const reasons = [...capabilityHits.slice(0, 2).map((hit) => `Matches ${hit}`), ...protocolHits.map((hit) => `Supports ${hit}`)]
    if (pancakeEvidence) reasons.push('PancakeSwap evidence in indexed metadata')
    if (intent.category && agent.category === intent.category) reasons.push(`${intent.category} specialist`)
    if (!reasons.length && intent.mode === 'browse') reasons.push('Available in the Kymera marketplace')
    return { agent, score: performance.score, matchScore: Math.round(matchScore), reasons, evaluation: performance.label }
  }).sort((a, b) => b.matchScore - a.matchScore).slice(0, limit)
}
