import { NextResponse } from 'next/server'
import { discoverAgents } from '@/lib/agent-discovery'
import { toUiAgent } from '@/lib/agent-repository'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, 'discover'), 60, 60_000)
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds)

  try {
    const body = await request.json().catch(() => ({})) as { query?: unknown; limit?: unknown }
    const query = typeof body.query === 'string' ? body.query.trim() : ''
    if (!query || query.length > 300) return NextResponse.json({ error: 'Enter a search query up to 300 characters.' }, { status: 400 })
    const max = Math.min(20, Math.max(1, Number(body.limit || 10)))

    const { intent, results } = await discoverAgents(query, max)
    return NextResponse.json({
      query,
      intent,
      // Stated plainly so the interface can describe what actually happened.
      interpreter: { mode: 'deterministic-keyword', usesLanguageModel: false },
      results: results.map((result) => ({
        ...toUiAgent(result.agent),
        matchScore: result.matchScore,
        reasons: result.reasons,
        evaluationStatus: result.evaluationStatus,
      })),
    })
  } catch {
    return NextResponse.json({ error: 'Discovery is unavailable right now.' }, { status: 503 })
  }
}
