import { OverviewPage } from '@/components/overview-page'
import { countAgents, getAgents, toUiAgent } from '@/lib/agent-repository'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function Page() {
  try {
    const [records, totalAgents, evaluatedCount] = await Promise.all([
      getAgents({ sort: 'score', take: 6 }),
      countAgents(),
      prisma.agent.count({ where: { evaluationStatus: 'EVALUATED' } }),
    ])
    return <OverviewPage agents={records.map((record) => toUiAgent(record))} totalAgents={totalAgents} evaluatedCount={evaluatedCount} />
  } catch {
    return <OverviewPage agents={[]} totalAgents={0} evaluatedCount={0} />
  }
}
