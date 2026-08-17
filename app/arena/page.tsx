import { ArenaPage } from '@/components/arena-page'
import { getAgents, toUiAgent } from '@/lib/agent-repository'
export default async function Page() {
  const records = await getAgents({ sort: 'score' })
  return <ArenaPage agents={records.map(toUiAgent)} />
}
