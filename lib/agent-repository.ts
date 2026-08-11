import { prisma } from '@/lib/prisma'
import type { Agent } from '@/lib/kymera'

export async function getAgents() {
  return prisma.agent.findMany({ include: { performance: true, capabilityItems: true }, orderBy: { createdAt: 'desc' } })
}

export async function getAgentById(id: string) {
  return prisma.agent.findUnique({ where: { id }, include: { performance: true, capabilityItems: true, sessions: { include: { permissions: true } }, transactions: true } })
}

export async function searchAgents(query: string) {
  return prisma.agent.findMany({ where: { OR: [{ name: { contains: query, mode: 'insensitive' } }, { description: { contains: query, mode: 'insensitive' } }, { category: { contains: query, mode: 'insensitive' } }] }, include: { performance: true, capabilityItems: true } })
}

export async function getAgentsByCategory(category: string) {
  return prisma.agent.findMany({ where: { category }, include: { performance: true, capabilityItems: true }, orderBy: { createdAt: 'desc' } })
}

export async function getTopAgents(limit = 6) {
  return prisma.agent.findMany({ take: limit, include: { performance: true, capabilityItems: true }, orderBy: { performance: { kymeraScore: 'desc' } } })
}

export async function getAgentPerformance(agentId: string) {
  return prisma.agentPerformance.findUnique({ where: { agentId } })
}

export function toUiAgent(agent: Awaited<ReturnType<typeof getAgents>>[number]): Agent {
  const performance = agent.performance
  const capabilities = agent.capabilityItems.map((item) => item.name)
  return {
    id: agent.id,
    name: agent.name,
    symbol: agent.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
    description: agent.description,
    category: agent.category as Agent['category'],
    score: performance?.kymeraScore ?? 0,
    verified: agent.verified,
    runs: performance ? (performance.tasksCompleted >= 1000 ? `${(performance.tasksCompleted / 1000).toFixed(1)}k` : String(performance.tasksCompleted)) : '0',
    success: `${performance?.successRate ?? 0}%`,
    change: '+0.0%',
    status: agent.status as Agent['status'],
    accent: '#e95d25',
    tags: capabilities.length ? capabilities : (Array.isArray(agent.capabilities) ? agent.capabilities.map(String) : []),
    creator: agent.ownerAddress,
    updated: agent.updatedAt.toLocaleDateString(),
  }
}
