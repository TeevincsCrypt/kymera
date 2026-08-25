import { AgentDetailPage, type AgentEvaluationView, type EvaluationComponent } from '@/components/agent-detail-page'
import { getAgentById, toUiAgent } from '@/lib/agent-repository'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const record = await getAgentById(id)
    if (!record) return <AgentDetailPage agent={null} evaluation={null} />

    const [confirmed, rejected] = await Promise.all([
      prisma.guardExecution.count({ where: { agentId: id, status: 'CONFIRMED' } }),
      prisma.guardExecution.count({ where: { agentId: id, decision: 'REJECTED' } }),
    ])

    const agent = toUiAgent({ ...record, guardExecutionCounts: { confirmed, rejected } })
    const latest = record.evaluations[0]
    const breakdown = (latest?.breakdown ?? {}) as { components?: EvaluationComponent[]; explanation?: string[] }

    const evaluation: AgentEvaluationView = latest
      ? {
          score: latest.score,
          sufficientEvidence: latest.sufficientEvidence,
          evidenceCount: latest.evidenceCount,
          method: latest.method,
          components: breakdown.components ?? [],
          explanation: breakdown.explanation ?? [],
          createdAt: latest.createdAt.toISOString(),
        }
      : null

    return <AgentDetailPage agent={agent} evaluation={evaluation} />
  } catch {
    return <AgentDetailPage agent={null} evaluation={null} />
  }
}
