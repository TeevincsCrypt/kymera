import { IntelligentDiscover } from '@/components/intelligent-discover'
import { getAgents, toUiAgent } from '@/lib/agent-repository'

export const dynamic = 'force-dynamic'

export default async function Page() {
  try {
    const records = await getAgents({ take: 30 })
    return <IntelligentDiscover initialAgents={records.map((record) => toUiAgent(record))} />
  } catch {
    return <IntelligentDiscover initialAgents={[]} />
  }
}
