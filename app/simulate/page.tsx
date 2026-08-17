import { SimulationLab } from '@/components/simulation-lab'
import { getAgents, toUiAgent } from '@/lib/agent-repository'

export default async function Page() {
  const records = await getAgents({ sort: 'newest' })
  return <SimulationLab agents={records.map(toUiAgent).map((agent) => ({ id: agent.id, name: agent.name, category: agent.category, tags: agent.tags }))} />
}
