import { ArenaPage } from '@/components/arena-page'
import { getAgents, toUiAgent } from '@/lib/agent-repository'

export const dynamic = 'force-dynamic'

export default async function Page() {
  try {
    const records = await getAgents({ sort: 'score', take: 40 })
    return <ArenaPage agents={records.map((record) => toUiAgent(record))} />
  } catch {
    return <ArenaPage agents={[]} />
  }
}
