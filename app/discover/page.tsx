import { DiscoverPage } from '@/components/discover-page'
import { getAgents, toUiAgent } from '@/lib/agent-repository'

export default async function Page() {
  try {
    const records = await getAgents()
    return <DiscoverPage agents={records.map(toUiAgent)} />
  } catch {
    return <DiscoverPage agents={[]} />
  }
}
