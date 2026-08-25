import { NextResponse } from 'next/server'
import { getPancakeProvider, parseTaskCriteria } from '@/lib/pancakeswap/provider'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, 'pancake-opportunities'), 60, 60_000)
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds)

  const provider = getPancakeProvider()
  try {
    const body = await request.json().catch(() => ({})) as { task?: unknown }
    const task = typeof body.task === 'string' ? body.task.trim() : ''
    if (!task) return NextResponse.json({ error: 'Describe what you are looking for.' }, { status: 400 })

    const health = await provider.health()
    const opportunities = await provider.getOpportunities(task)

    return NextResponse.json({
      status: { configured: health.status === 'healthy', chain: health.chain, source: health.source ?? 'none', execution: 'guard_gated' },
      health,
      task,
      // Echoed back so the interface can show which rules the request actually triggered.
      criteria: parseTaskCriteria(task).labels,
      opportunities,
      updatedAt: new Date().toISOString(),
    })
  } catch (error) {
    const health = await provider.health().catch(() => null)
    return NextResponse.json(
      {
        status: { configured: false, chain: 'bsc', source: 'none', execution: 'guard_gated' },
        health,
        criteria: [],
        opportunities: [],
        updatedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'PancakeSwap data is unavailable.',
      },
      { status: 503 },
    )
  }
}
