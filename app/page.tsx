import { OverviewPage } from '@/components/overview-page'
import { getAgents, toUiAgent } from '@/lib/agent-repository'
import { agents as demoAgents } from '@/lib/kymera'

export default async function Page() {
  try {
    const records = await getAgents({ sort: 'score' })
    return <OverviewPage agents={records.length ? records.map(toUiAgent) : demoAgents} />
  } catch {
    return <OverviewPage agents={demoAgents} />
  }
}
