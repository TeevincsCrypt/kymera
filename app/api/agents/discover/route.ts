import { NextResponse } from 'next/server'
import { categoryCounts, discoverAgents } from '@/lib/agent-discovery'
import { toUiAgent } from '@/lib/agent-repository'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, 'discover'), 90, 60_000)
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds)

  try {
    const body = await request.json().catch(() => ({})) as { query?: unknown; limit?: unknown }
    const query = typeof body.query === 'string' ? body.query.trim() : ''
    if (!query || query.length > 300) return NextResponse.json({ error: 'Enter a search query up to 300 characters.' }, { status: 400 })
    const max = Math.min(48, Math.max(1, Number(body.limit || 24)))

    const { intent, results, fellBack, catalogTotal } = await discoverAgents(query, max)

    return NextResponse.json({
      query,
      intent,
      fellBack,
      catalogTotal,
      interpreter: { mode: 'deterministic-keyword', usesLanguageModel: false },
      categories: await categoryCounts(),
      results: results.map((result) => ({
        ...toUiAgent(result.agent),
        matchScore: result.matchScore,
        reasons: result.reasons,
        evaluationStatus: result.evaluationStatus,
      })),
    })
  } catch (error) {
    // Surfaced rather than swallowed — a hidden database error is indistinguishable
    // from "no results", which is what made the marketplace look empty.
    return NextResponse.json(
      { error: 'Search failed.', detail: error instanceof Error ? error.message.slice(0, 300) : 'Unknown error' },
      { status: 503 },
    )
  }
}
