import { IntelligentDiscover } from '@/components/intelligent-discover'
import { countAgents, getAgents, toUiAgent } from '@/lib/agent-repository'
import { categoryCounts } from '@/lib/agent-discovery'

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams
  try {
    const [records, categories, catalogTotal] = await Promise.all([
      getAgents({ category, take: 24 }),
      categoryCounts(),
      countAgents(),
    ])
    return (
      <IntelligentDiscover
        initialAgents={records.map((record) => toUiAgent(record))}
        categories={categories}
        catalogTotal={catalogTotal}
        initialCategory={category}
        databaseError={null}
      />
    )
  } catch (error) {
    // Surfaced so an unreachable database reads as a fault, not as an empty catalog.
    return (
      <IntelligentDiscover
        initialAgents={[]}
        categories={[]}
        catalogTotal={0}
        databaseError={error instanceof Error ? error.message.split('\n')[0].slice(0, 200) : 'Database unavailable'}
      />
    )
  }
}
