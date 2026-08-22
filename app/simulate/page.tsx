import { SimulationLab } from '@/components/simulation-lab'
import { getAgents, toUiAgent } from '@/lib/agent-repository'

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }: { searchParams: Promise<{ agentId?: string }> }) {
  const { agentId } = await searchParams
  try {
    const records = await getAgents({ sort: 'score', take: 50 })
    const agents = records.map((record) => toUiAgent(record)).map((agent) => ({ id: agent.id, name: agent.name, category: agent.category }))
    return <SimulationLab initialAgentId={agentId} agents={agents} />
  } catch {
    return <SimulationLab initialAgentId={agentId} agents={[]} />
  }
}
