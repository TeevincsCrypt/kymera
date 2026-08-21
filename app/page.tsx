import { OverviewPage } from '@/components/overview-page'
import { countAgents, getAgents, toUiAgent } from '@/lib/agent-repository'
import { categoryCounts } from '@/lib/agent-discovery'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function Page() {
  try {
    const [records, totalAgents, evaluatedCount, categories, erc8004Count] = await Promise.all([
      getAgents({ sort: 'score', take: 6 }),
      countAgents(),
      prisma.agent.count({ where: { evaluationStatus: 'EVALUATED' } }),
      categoryCounts(),
      prisma.agent.count({ where: { erc8004TokenId: { not: null } } }),
    ])
    return (
      <OverviewPage
        agents={records.map((record) => toUiAgent(record))}
        totalAgents={totalAgents}
        evaluatedCount={evaluatedCount}
        erc8004Count={erc8004Count}
        categories={categories}
        databaseError={null}
      />
    )
  } catch (error) {
    // Surfaced, not swallowed. A hidden database error previously rendered as an
    // empty catalog, which is indistinguishable from "there are no agents".
    return (
      <OverviewPage
        agents={[]}
        totalAgents={0}
        evaluatedCount={0}
        erc8004Count={0}
        categories={[]}
        databaseError={error instanceof Error ? error.message.split('\n')[0].slice(0, 200) : 'Database unavailable'}
      />
    )
  }
}
