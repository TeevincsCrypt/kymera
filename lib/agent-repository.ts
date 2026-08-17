import { prisma } from '@/lib/prisma'
import type { Agent } from '@/lib/kymera'

export type AgentFilters = { query?: string; category?: string; chain?: string; verified?: boolean; minScore?: number; sort?: 'score' | 'newest' }

export async function getAgents(filters: AgentFilters = {}) {
  const where = {
    ...(filters.query ? { OR: [{ name: { contains: filters.query, mode: 'insensitive' as const } }, { description: { contains: filters.query, mode: 'insensitive' as const } }, { category: { contains: filters.query, mode: 'insensitive' as const } }] } : {}),
    ...(filters.category && filters.category !== 'All' ? { category: filters.category } : {}),
    ...(filters.chain ? { chain: filters.chain } : {}),
    ...(filters.verified !== undefined ? { verified: filters.verified } : {}),
    ...(filters.minScore ? { performance: { kymeraScore: { gte: filters.minScore } } } : {}),
  }
  return prisma.agent.findMany({ where, include: { performance: true, capabilityItems: true, benchmarkResults: { select: { score: true } } }, orderBy: filters.sort === 'newest' ? { createdAt: 'desc' } : { performance: { kymeraScore: 'desc' } } })
}

export async function getAgentById(id: string) { return prisma.agent.findUnique({ where: { id }, include: { performance: true, capabilityItems: true, sessions: { include: { permissions: true } }, transactions: true } }) }
export async function getAgentsByCategory(category: string) { return getAgents({ category }) }
export async function getTopAgents(limit = 6) { return prisma.agent.findMany({ take: limit, include: { performance: true, capabilityItems: true, benchmarkResults: { select: { score: true } } }, orderBy: { performance: { kymeraScore: 'desc' } } }) }
export async function getAgentPerformance(agentId: string) { return prisma.agentPerformance.findUnique({ where: { agentId } }) }

export function toUiAgent(agent: Awaited<ReturnType<typeof getAgents>>[number]): Agent {
  const performance = agent.performance
  const benchmarkScores = agent.benchmarkResults.map((item) => item.score).filter((score): score is number => typeof score === 'number')
  const benchmarkScore = benchmarkScores.length ? Math.round(benchmarkScores.reduce((sum, score) => sum + score, 0) / benchmarkScores.length) : null
  const capabilities = agent.capabilityItems.map((item) => item.name)
  const runs = performance?.tasksCompleted ?? agent.benchmarkResults.length
  return { id: agent.id, name: agent.name, symbol: agent.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(), description: agent.description, category: agent.category as Agent['category'], score: performance?.kymeraScore ?? benchmarkScore ?? 0, verified: agent.verified, runs: runs > 0 ? (runs >= 1000 ? `${(runs / 1000).toFixed(1)}k` : String(runs)) : 'Not yet evaluated', success: performance ? `${performance.successRate}%` : 'Not yet evaluated', change: performance ? '+0.0%' : '—', status: agent.status as Agent['status'], accent: '#e95d25', tags: capabilities.length ? capabilities : (Array.isArray(agent.capabilities) ? agent.capabilities.map(String) : []), creator: agent.ownerAddress, updated: agent.updatedAt.toLocaleDateString(), source: agent.erc8004TokenId ? 'ERC-8004 Registered' : undefined }
}
