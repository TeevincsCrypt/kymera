import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { Agent, EvaluationStatus, TrustTier } from '@/lib/kymera'

export type AgentFilters = {
  query?: string
  category?: string
  chain?: string
  verified?: boolean
  minScore?: number
  trustTier?: string
  sort?: 'score' | 'newest'
  take?: number
  skip?: number
}

const agentInclude = {
  capabilityItems: true,
  _count: { select: { guardExecutions: true } },
} satisfies Prisma.AgentInclude

export type AgentRecord = Prisma.AgentGetPayload<{ include: typeof agentInclude }>

function buildWhere(filters: AgentFilters): Prisma.AgentWhereInput {
  return {
    ...(filters.query
      ? {
          OR: [
            { name: { contains: filters.query, mode: 'insensitive' as const } },
            { description: { contains: filters.query, mode: 'insensitive' as const } },
            { category: { contains: filters.query, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(filters.category && filters.category !== 'All' ? { category: filters.category } : {}),
    ...(filters.chain ? { chain: filters.chain } : {}),
    ...(filters.verified !== undefined ? { verified: filters.verified } : {}),
    ...(filters.trustTier ? { trustTier: filters.trustTier } : {}),
    ...(filters.minScore !== undefined && Number.isFinite(filters.minScore) ? { kymeraScore: { gte: filters.minScore } } : {}),
  }
}

export async function getAgents(filters: AgentFilters = {}) {
  return prisma.agent.findMany({
    where: buildWhere(filters),
    include: agentInclude,
    // Unevaluated agents sort last rather than being treated as a zero score.
    orderBy: filters.sort === 'newest' ? { createdAt: 'desc' } : [{ kymeraScore: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
    ...(filters.take ? { take: filters.take } : {}),
    ...(filters.skip ? { skip: filters.skip } : {}),
  })
}

export async function countAgents(filters: AgentFilters = {}) {
  return prisma.agent.count({ where: buildWhere(filters) })
}

export async function getAgentById(id: string) {
  return prisma.agent.findUnique({
    where: { id },
    include: {
      ...agentInclude,
      evaluations: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })
}

export async function getTopAgents(limit = 6) {
  return prisma.agent.findMany({
    where: { kymeraScore: { not: null } },
    include: agentInclude,
    take: limit,
    orderBy: { kymeraScore: 'desc' },
  })
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'AG'
}

/**
 * Maps a database record to the UI shape. This function must never substitute a
 * placeholder for missing data — an unknown score stays null and the UI renders the
 * evaluation status instead.
 */
export function toUiAgent(agent: AgentRecord & { guardExecutionCounts?: { confirmed: number; rejected: number } }): Agent {
  const capabilities = agent.capabilityItems.map((item) => item.name)
  const declared = Array.isArray(agent.capabilities) ? agent.capabilities.map(String) : []
  const tags = capabilities.length ? capabilities : declared

  return {
    id: agent.id,
    name: agent.name,
    symbol: initials(agent.name),
    description: agent.description,
    category: agent.category as Agent['category'],
    chain: agent.chain,
    score: agent.kymeraScore,
    evaluationStatus: (agent.evaluationStatus as EvaluationStatus) ?? 'UNEVALUATED',
    trustTier: (agent.trustTier as TrustTier) ?? 'INDEXED',
    identityVerified: Boolean(agent.erc8004TokenId && agent.erc8004RegistryAddress),
    origin: agent.erc8004TokenId ? 'ERC-8004' : 'Local',
    status: agent.status as Agent['status'],
    accent: '#e95d25',
    tags,
    creator: agent.ownerAddress,
    updated: agent.updatedAt.toISOString(),
    evaluatedAt: agent.kymeraEvaluatedAt ? agent.kymeraEvaluatedAt.toISOString() : null,
    executions: agent.guardExecutionCounts ?? { confirmed: 0, rejected: 0 },
  }
}
