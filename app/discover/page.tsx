import { IntelligentDiscover } from '@/components/intelligent-discover'
import { getAgents, toUiAgent } from '@/lib/agent-repository'
import { agents as demoAgents } from '@/lib/kymera'

export default async function Page() {
  try {
    const records = await getAgents()
    return <IntelligentDiscover initialAgents={records.length ? records.map(toUiAgent) : demoAgents} />
  } catch {
    return <IntelligentDiscover initialAgents={demoAgents} />
  }
}
