import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recommendArenaAgents, arenaTaskLabel } from '@/lib/arena'

export async function POST(request: Request) {
  try {
    const body = await request.json() as { task?: string; agentIds?: string[] }
    const task = body.task?.trim()
    const agentIds = Array.isArray(body.agentIds) ? [...new Set(body.agentIds)].slice(0, 5) : []
    if (!task || task.length < 8) return NextResponse.json({ error: 'Describe a benchmark task with at least 8 characters.' }, { status: 400 })
    if (agentIds.length < 2) return NextResponse.json({ error: 'Select at least 2 agents.' }, { status: 400 })

    const agents = await prisma.agent.findMany({
      where: { id: { in: agentIds } },
      include: { performance: true, capabilityItems: true },
    })
    if (agents.length < 2) return NextResponse.json({ error: 'Two selected agents were not found in the index.' }, { status: 404 })

    const rankings = recommendArenaAgents(agents, task)
    const benchmark = await prisma.benchmark.create({ data: { task, status: 'completed', completedAt: new Date() } })
    await prisma.benchmarkResult.createMany({ data: rankings.map((ranking) => ({ benchmarkId: benchmark.id, agentId: ranking.agentId, score: ranking.score, accuracy: ranking.evaluated ? ranking.score : null, riskScore: ranking.evaluated ? 100 - ranking.score : null, rank: ranking.rank, capabilityMatch: ranking.capabilityMatch, taskRelevance: ranking.taskRelevance, protocolMatch: ranking.protocolMatch, metadataQuality: ranking.metadataQuality, evaluationConfidence: ranking.evaluationConfidence, reasoning: ranking.reasons })) })

    return NextResponse.json({ benchmarkId: benchmark.id, task, taskLabel: arenaTaskLabel(task), winner: rankings[0], rankings, share: { title: `${rankings[0].name} wins the Kymera Arena`, text: `${rankings[0].name} ranked #1 for “${task}” with a transparent score of ${rankings[0].score}/100.` } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Arena benchmark failed' }, { status: 500 })
  }
}
