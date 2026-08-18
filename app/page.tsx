import { OverviewPage } from '@/components/overview-page'
import { getAgents, toUiAgent } from '@/lib/agent-repository'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const records = await getAgents({ sort: 'score' })
  return <OverviewPage agents={records.map(toUiAgent)} />
}
