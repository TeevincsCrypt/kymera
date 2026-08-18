import { SimulationLab } from '@/components/simulation-lab'
import { getAgents, toUiAgent } from '@/lib/agent-repository'

export default async function Page({ searchParams }: { searchParams: Promise<{ agentId?: string }> }) {
  const records = await getAgents({ sort: 'newest' })
  const { agentId } = await searchParams
  return <SimulationLab initialAgentId={agentId} agents={records.map(toUiAgent).map((agent) => ({ id: agent.id, name: agent.name, category: agent.category, tags: agent.tags }))} />
}
