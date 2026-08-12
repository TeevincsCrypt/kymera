import { DetailPage } from '@/components/workspace-pages'
import { getAgentById, toUiAgent } from '@/lib/agent-repository'
import { HireReview } from '@/components/hire-review'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const record = await getAgentById(id)
    const agent = record ? toUiAgent(record as Awaited<ReturnType<typeof import('@/lib/agent-repository').getAgents>>[number]) : null
    return <><DetailPage agent={agent} />{agent && <div className="mx-auto max-w-7xl px-5 pb-12 md:px-8"><HireReview agent={agent} /></div>}</>
  } catch {
    return <DetailPage agent={null} />
  }
}
