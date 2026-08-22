/**
 * Evaluation pipeline. This is what makes Kymera Score real for agents that came
 * from the ERC-8004 registry rather than the demo seed: it gathers observable
 * evidence, scores it deterministically, and persists both the score and the
 * reasoning behind it.
 */

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { probeEndpoint } from './probe'
import { SCORE_METHOD, evaluateAgent, type EvaluationEvidence, type EvaluationResult } from './score'
import { evidenceCategory } from '@/lib/erc8004/adapter'

export type RunOptions = { probe?: boolean }

export async function gatherEvidence(
  agentId: string,
  options: RunOptions = {},
): Promise<{ evidence: EvaluationEvidence; endpointDetail: string; category: string } | null> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: { _count: { select: { capabilityItems: true } } },
  })
  if (!agent) return null

  // Reliability comes from the canonical Guard ledger — real, confirmed transactions.
  const [confirmed, failed] = await Promise.all([
    prisma.guardExecution.count({ where: { agentId, status: 'CONFIRMED' } }),
    prisma.guardExecution.count({ where: { agentId, status: 'FAILED' } }),
  ])

  let endpointReachable: boolean | null = null
  let endpointDetail = agent.endpoint ? 'Endpoint published but not probed' : 'No endpoint published'
  if (options.probe && agent.endpoint) {
    const probe = await probeEndpoint(agent.endpoint)
    endpointReachable = probe.reachable
    endpointDetail = probe.detail
  }

  return {
    // Recomputed with the current rules so a scoring pass also corrects stale buckets.
    // The stored category is deliberately NOT passed in: evidenceCategory honours a
    // declared category first, so including it would echo the stale value back and
    // re-derive nothing.
    category: evidenceCategory({
      name: agent.name,
      description: agent.description,
      endpoint: agent.endpoint,
      capabilities: Array.isArray(agent.capabilities) ? agent.capabilities : [],
      supportedProtocols: Array.isArray(agent.supportedProtocols) ? agent.supportedProtocols : [],
    }),
    evidence: {
      erc8004TokenId: agent.erc8004TokenId,
      erc8004RegistryAddress: agent.erc8004RegistryAddress,
      erc8004MetadataUri: agent.erc8004MetadataUri,
      erc8004MetadataHash: agent.erc8004MetadataHash,
      ownerAddress: agent.ownerAddress,
      name: agent.name,
      description: agent.description,
      capabilities: agent.capabilities,
      supportedProtocols: agent.supportedProtocols,
      capabilityItemCount: agent._count.capabilityItems,
      endpoint: agent.endpoint,
      executions: confirmed + failed > 0 ? { confirmed, failed } : undefined,
      endpointReachable,
    },
    endpointDetail,
  }
}

export async function runEvaluation(agentId: string, options: RunOptions = {}): Promise<EvaluationResult | null> {
  const gathered = await gatherEvidence(agentId, options)
  if (!gathered) return null
  const result = evaluateAgent(gathered.evidence)

  const component = (id: string) => result.components.find((item) => item.id === id)?.value ?? 0

  await prisma.$transaction([
    prisma.agentEvaluation.create({
      data: {
        agentId,
        score: result.score,
        sufficientEvidence: result.sufficientEvidence,
        identity: component('identity'),
        metadata: component('metadata'),
        capability: component('capability'),
        reliability: result.components.find((item) => item.id === 'reliability')?.value ?? null,
        endpointReachable: gathered.evidence.endpointReachable ?? null,
        endpointCheckedAt: options.probe ? new Date() : null,
        evidenceCount: result.evidenceCount,
        breakdown: { components: result.components, explanation: result.explanation } as unknown as Prisma.InputJsonValue,
        method: SCORE_METHOD,
      },
    }),
    prisma.agent.update({
      where: { id: agentId },
      data: {
        kymeraScore: result.score,
        kymeraEvaluatedAt: new Date(),
        evaluationStatus: result.sufficientEvidence ? 'EVALUATED' : 'INSUFFICIENT_EVIDENCE',
        // Re-derive the category from current evidence. Agents indexed by an earlier
        // version of the categoriser are otherwise stuck in whatever bucket it chose,
        // which is how a catalog ends up looking like it is all one category.
        category: gathered.category,
        // trustTier is deliberately not written here. It is promoted below with a
        // guarded updateMany so a human-set VETTED tier is never downgraded.
      },
    }),
  ])

  // Promote INDEXED -> EVALUATED without ever demoting a manually VETTED agent.
  if (result.sufficientEvidence) {
    await prisma.agent.updateMany({ where: { id: agentId, trustTier: 'INDEXED' }, data: { trustTier: 'EVALUATED' } })
  }

  return result
}

export async function runEvaluationBatch(input: { limit?: number; probe?: boolean; onlyUnevaluated?: boolean } = {}) {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 200)
  const agents = await prisma.agent.findMany({
    where: input.onlyUnevaluated ? { evaluationStatus: 'UNEVALUATED' } : undefined,
    orderBy: [{ kymeraEvaluatedAt: { sort: 'asc', nulls: 'first' } }, { updatedAt: 'desc' }],
    take: limit,
    select: { id: true },
  })

  const summary = { requested: agents.length, evaluated: 0, insufficient: 0, failed: 0 }
  for (const agent of agents) {
    try {
      const result = await runEvaluation(agent.id, { probe: input.probe })
      if (!result) { summary.failed += 1; continue }
      if (result.sufficientEvidence) summary.evaluated += 1
      else summary.insufficient += 1
    } catch {
      summary.failed += 1
    }
  }
  return summary
}

export async function latestEvaluation(agentId: string) {
  return prisma.agentEvaluation.findFirst({ where: { agentId }, orderBy: { createdAt: 'desc' } })
}
