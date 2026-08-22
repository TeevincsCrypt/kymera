import type { Prisma } from '@prisma/client'
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

export type DiscoveryResponse = {
  intent: DiscoveryIntent
  results: DiscoveryResult[]
  /** True when nothing matched and the top of the catalog is shown instead. */
  fellBack: boolean
  catalogTotal: number
}

function searchableText(agent: AgentRecord) {
  return [
    agent.name,
    agent.description,
    agent.category,
    agent.chain,
    agent.ownerAddress,
    ...agent.capabilityItems.map((item) => item.name),
    ...(Array.isArray(agent.capabilities) ? agent.capabilities.map(String) : []),
    ...(Array.isArray(agent.supportedProtocols) ? agent.supportedProtocols.map(String) : []),
  ].join(' ').toLowerCase()
}

const agentInclude = {
  capabilityItems: true,
  _count: { select: { guardExecutions: true } },
} satisfies Prisma.AgentInclude

/**
 * Search runs in the database, not in memory.
 *
 * The previous implementation loaded 500 rows and filtered them in JS, so on a
 * registry-scale catalog a matching agent outside that arbitrary window was simply
 * invisible — searches returned nothing even when matches existed.
 */
export async function discoverAgents(query: string, limit = 12): Promise<DiscoveryResponse> {
  const intent = interpretQuery(query)
  const catalogTotal = await prisma.agent.count()

  // Every meaningful token from the query, matched against the indexed text columns.
  const terms = [...new Set([...intent.terms, ...intent.capabilities, ...intent.protocols.map((p) => p.toLowerCase())])]
    .filter((term) => term.length > 1)
    .slice(0, 12)

  const textClauses: Prisma.AgentWhereInput[] = terms.flatMap((term) => [
    { name: { contains: term, mode: 'insensitive' as const } },
    { description: { contains: term, mode: 'insensitive' as const } },
    { category: { contains: term, mode: 'insensitive' as const } },
    { capabilityItems: { some: { name: { contains: term, mode: 'insensitive' as const } } } },
  ])

  const where: Prisma.AgentWhereInput = {
    ...(intent.category ? { category: intent.category } : {}),
    ...(textClauses.length ? { OR: textClauses } : {}),
  }

  let candidates = await prisma.agent.findMany({
    where,
    take: 300,
    include: agentInclude,
    orderBy: [{ kymeraScore: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
  })

  // Relax progressively rather than showing "no results" while the catalog has agents.
  let fellBack = false
  if (candidates.length === 0 && intent.category) {
    candidates = await prisma.agent.findMany({
      where: textClauses.length ? { OR: textClauses } : {},
      take: 300,
      include: agentInclude,
      orderBy: [{ kymeraScore: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
    })
  }
  if (candidates.length === 0 && catalogTotal > 0) {
    fellBack = true
    candidates = await prisma.agent.findMany({
      take: limit,
      include: agentInclude,
      orderBy: [{ kymeraScore: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
    })
  }

  return { intent, results: rankCandidates(candidates, intent, limit, fellBack), fellBack, catalogTotal }
}

/**
 * Deterministic, explainable ranking. Every point maps to a reason the UI shows, and
 * the evaluation contribution is only counted when a real score exists.
 */
function rankCandidates(candidates: AgentRecord[], intent: DiscoveryIntent, limit: number, fellBack: boolean): DiscoveryResult[] {
  return candidates
    .map((agent) => {
      const text = searchableText(agent)
      const hits = intent.terms.filter((term) => text.includes(term))
      const capabilityHits = intent.capabilities.filter((term) => text.includes(term))
      const protocolHits = intent.protocols.filter((term) => text.includes(term.toLowerCase()))
      const categoryMatch = Boolean(intent.category && agent.category === intent.category)
      const chainMatch = Boolean(intent.chain && text.includes(intent.chain.toLowerCase()))
      const nameHit = intent.terms.some((term) => agent.name.toLowerCase().includes(term))

      const matchScore = Math.min(
        100,
        hits.length * 10 +
          (nameHit ? 20 : 0) +
          capabilityHits.length * 10 +
          protocolHits.length * 10 +
          (categoryMatch ? 22 : 0) +
          (chainMatch ? 10 : 0) +
          (agent.kymeraScore ?? 0) * 0.2,
      )

      const reasons: string[] = []
      if (nameHit) reasons.push('Name matches your search')
      if (capabilityHits.length) reasons.push(`Capabilities match ${capabilityHits.slice(0, 3).join(', ')}`)
      if (protocolHits.length) reasons.push(`Supports ${protocolHits.join(', ')}`)
      if (categoryMatch) reasons.push(`${intent.category} specialist`)
      if (chainMatch) reasons.push('Registered on the requested chain')
      if (agent.kymeraScore !== null) reasons.push(`Kymera Score ${agent.kymeraScore}/100`)
      else reasons.push('Not yet evaluated by Kymera')
      if (agent.erc8004TokenId) reasons.push('ERC-8004 identity confirmed')
      if (fellBack) reasons.unshift('Shown because nothing matched your exact wording')

      return { agent, score: agent.kymeraScore, matchScore: Math.round(matchScore), reasons, evaluationStatus: agent.evaluationStatus }
    })
    .sort((a, b) => b.matchScore - a.matchScore || (b.score ?? -1) - (a.score ?? -1))
    .slice(0, limit)
}

/** Agent counts per category, for the marketplace filter bar. */
export async function categoryCounts() {
  const grouped = await prisma.agent.groupBy({ by: ['category'], _count: { _all: true } })
  return grouped
    .map((row) => ({ category: row.category, count: row._count._all }))
    .sort((a, b) => b.count - a.count)
}
