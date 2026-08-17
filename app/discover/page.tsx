import { IntelligentDiscover } from '@/components/intelligent-discover'
import { getAgents, toUiAgent } from '@/lib/agent-repository'
export default async function Page() {
  const records = await getAgents()
  return <IntelligentDiscover initialAgents={records.map(toUiAgent)} />
}
