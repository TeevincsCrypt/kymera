import { LandingPage } from '@/components/landing-page'
import { countAgents } from '@/lib/agent-repository'
import { categoryCounts } from '@/lib/agent-discovery'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function Page() {
  try {
    const [totalAgents, evaluatedAgents, categories] = await Promise.all([
      countAgents(),
      prisma.agent.count({ where: { evaluationStatus: 'EVALUATED' } }),
      categoryCounts(),
    ])
    return <LandingPage stats={{ totalAgents, evaluatedAgents, categories }} />
  } catch {
    // The landing page still renders with zeroes rather than erroring the front door.
    return <LandingPage stats={{ totalAgents: 0, evaluatedAgents: 0, categories: [] }} />
  }
}
