import { DetailPage } from '@/components/workspace-pages'
import { getAgentById, toUiAgent } from '@/lib/agent-repository'
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const record = await getAgentById(id)
    const agent = record ? toUiAgent(record as Awaited<ReturnType<typeof import('@/lib/agent-repository').getAgents>>[number]) : null
    return <DetailPage agent={agent} />
  } catch {
    return <DetailPage agent={null} />
  }
}
