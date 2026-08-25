import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ARENA_METHOD, ARENA_METHODOLOGY, arenaTaskLabel, recommendArenaAgents } from '@/lib/arena'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, 'arena'), 30, 60_000)
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds)

  try {
    const body = await request.json().catch(() => ({})) as { task?: unknown; agentIds?: unknown }
    const task = typeof body.task === 'string' ? body.task.trim() : ''
    const agentIds = Array.isArray(body.agentIds) ? [...new Set(body.agentIds.map(String))].slice(0, 5) : []

    if (task.length < 8) return NextResponse.json({ error: 'Describe a comparison task with at least 8 characters.' }, { status: 400 })
    if (task.length > 500) return NextResponse.json({ error: 'Keep the task under 500 characters.' }, { status: 400 })
    if (agentIds.length < 2) return NextResponse.json({ error: 'Select at least 2 agents to compare.' }, { status: 400 })

    const agents = await prisma.agent.findMany({
      where: { id: { in: agentIds } },
      include: { capabilityItems: true, _count: { select: { guardExecutions: true } } },
    })
    if (agents.length < 2) return NextResponse.json({ error: 'At least two of the selected agents were not found in the index.' }, { status: 404 })

    const rankings = recommendArenaAgents(agents, task)

    const benchmark = await prisma.$transaction(async (tx) => {
      const record = await tx.benchmark.create({ data: { task, status: 'completed', completedAt: new Date() } })
      await tx.benchmarkResult.createMany({
        data: rankings.map((ranking) => ({
          benchmarkId: record.id,
          agentId: ranking.agentId,
          score: ranking.score,
          rank: ranking.rank,
          capabilityMatch: ranking.capabilityMatch,
          taskRelevance: ranking.taskRelevance,
          metadataQuality: ranking.identityStrength,
          // Deliberately left null: Kymera does not execute agents, so it cannot
          // measure accuracy, latency, cost, or risk. Recording zeroes here would
          // present a measurement that was never taken.
          accuracy: null,
          executionTime: null,
          cost: null,
          riskScore: null,
          protocolMatch: null,
          evaluationConfidence: null,
          reasoning: { reasons: ranking.reasons, appliedWeights: ranking.appliedWeights, method: ARENA_METHOD },
        })),
      })
      return record
    })

    return NextResponse.json({
      benchmarkId: benchmark.id,
      task,
      taskLabel: arenaTaskLabel(task),
      methodology: ARENA_METHODOLOGY,
      winner: rankings[0],
      rankings,
      reproducible: true,
      share: {
        title: `${rankings[0].name} ranks first for this task`,
        text: `${rankings[0].name} ranked #1 for "${task}" with a Kymera fit score of ${rankings[0].score}/100, based on indexed capability and identity evidence. Kymera does not execute agents; this is a transparent metadata comparison.`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Arena comparison failed' }, { status: 500 })
  }
}
