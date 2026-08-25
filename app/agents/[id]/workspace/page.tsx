import { notFound } from 'next/navigation'
import { AgentWorkspace } from '@/components/product/agent-workspace'
import { getAgentById, toUiAgent } from '@/lib/agent-repository'

export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const record = await getAgentById(id)
  if (!record) notFound()
  return <AgentWorkspace agent={toUiAgent(record)} />
}
