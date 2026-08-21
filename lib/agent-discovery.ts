import { prisma } from '@/lib/prisma'
import { interpretQuery, type DiscoveryIntent } from '@/lib/ai/query-interpreter'
import type { AgentRecord } from '@/lib/agent-repository'

export type DiscoveryResult = {
  agent: AgentRecord
  score: number | null
  matchScore: number
  reasons: string[]
  evaluationStatus: string
}

function searchableText(agent: AgentRecord) {
  return [
    agent.name,
    agent.description,
    agent.category,
    agent.chain,
    ...agent.capabilityItems.map((item) => item.name),
    ...(Array.isArray(agent.capabilities) ? agent.capabilities.map(String) : []),
    ...(Array.isArray(agent.supportedProtocols) ? agent.supportedProtocols.map(String) : []),
  ].join(' ').toLowerCase()
}

export async function discoverAgents(query: string, limit = 10) {
  const intent = interpretQuery(query)
  const candidates = await prisma.agent.findMany({
    where: intent.chain ? { chain: { contains: intent.chain.replace(' Chain', ''), mode: 'insensitive' } } : undefined,
    take: 500,
    include: { capabilityItems: true, _count: { select: { guardExecutions: true } } },
    orderBy: { updatedAt: 'desc' },
  })

  const filtered = candidates.filter((agent) => {
    const text = searchableText(agent)
    const relevant = [...intent.terms, ...intent.capabilities, ...intent.protocols].some((term) => text.includes(term.toLowerCase()))
    if (intent.mode === 'task' && !relevant) return false
    if (intent.risk === 'low' && !/(low risk|safe|risk management|risk|guard|monitor|monitoring|alert|analytics)/.test(text)) return false
    if (intent.risk === 'high' && !/(high risk|aggressive|trading)/.test(text)) return false
    return true
  })

  return { intent, results: rankCandidates(filtered, intent, limit) }
}

/**
 * Deterministic, explainable ranking. Every point a candidate scores maps to a
 * reason string the UI shows the user — nothing here is a black box, and the
 * evaluation contribution is only counted when a real score exists.
 */
function rankCandidates(candidates: AgentRecord[], intent: DiscoveryIntent, limit: number): DiscoveryResult[] {
  return candidates
    .map((agent) => {
      const text = searchableText(agent)
      const hits = intent.terms.filter((term) => text.includes(term))
      const capabilityHits = intent.capabilities.filter((term) => text.includes(term))
      const protocolHits = intent.protocols.filter((term) => text.includes(term.toLowerCase()))
      const pancakeEvidence = intent.capabilities.includes('pancakeswap') && ['pancakeswap', 'pancake swap', 'liquidity', 'amm', 'pool'].some((term) => text.includes(term))
      const categoryMatch = Boolean(intent.category && agent.category === intent.category)
      const chainMatch = Boolean(intent.chain && text.includes(intent.chain.toLowerCase()))

      const matchScore = Math.min(
        100,
        hits.length * 12 +
          capabilityHits.length * 10 +
          protocolHits.length * 10 +
          (pancakeEvidence ? 24 : 0) +
          (categoryMatch ? 25 : 0) +
          (chainMatch ? 15 : 0) +
          (agent.kymeraScore ?? 0) * 0.25,
      )

      const reasons = [
        ...capabilityHits.slice(0, 2).map((hit) => `Matches ${hit}`),
        ...protocolHits.map((hit) => `Supports ${hit}`),
      ]
      if (pancakeEvidence) reasons.push('PancakeSwap evidence in indexed metadata')
      if (categoryMatch) reasons.push(`${intent.category} specialist`)
      if (agent.kymeraScore !== null) reasons.push(`Kymera Score ${agent.kymeraScore}/100`)
      else reasons.push('Not yet evaluated by Kymera')
      if (agent.erc8004TokenId) reasons.push('ERC-8004 identity confirmed')
      if (!reasons.length && intent.mode === 'browse') reasons.push('Available in the Kymera marketplace')

      return {
        agent,
        score: agent.kymeraScore,
        matchScore: Math.round(matchScore),
        reasons,
        evaluationStatus: agent.evaluationStatus,
      }
    })
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit)
}
