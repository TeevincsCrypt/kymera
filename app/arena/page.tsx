import { ArenaPage } from '@/components/arena-page'
import { getAgents, toUiAgent } from '@/lib/agent-repository'
import { agents as demoAgents } from '@/lib/kymera'

export default async function Page() {
  try {
    const records = await getAgents({ sort: 'score' })
    return <ArenaPage agents={records.length ? records.map(toUiAgent) : demoAgents} />
  } catch {
    return <ArenaPage agents={demoAgents} />
  }
}
