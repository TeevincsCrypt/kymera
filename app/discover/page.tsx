import { DiscoverPage } from '@/components/discover-page'
import { getAgents, toUiAgent } from '@/lib/agent-repository'
import { agents as demoAgents } from '@/lib/kymera'

export default async function Page() {
  try {
    const records = await getAgents()
    return <DiscoverPage agents={records.length ? records.map(toUiAgent) : demoAgents} />
  } catch {
    return <DiscoverPage agents={demoAgents} />
  }
}
