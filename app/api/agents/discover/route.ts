import { NextRequest, NextResponse } from 'next/server'
import { discoverAgents } from '@/lib/agent-discovery'
import { toUiAgent } from '@/lib/agent-repository'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const query = typeof body.query === 'string' ? body.query.trim() : ''
    if (!query || query.length > 300) return NextResponse.json({ error: 'Enter a search query up to 300 characters.' }, { status: 400 })
    const limit = Math.min(10, Math.max(1, Number(body.limit || 10)))
    const { intent, results } = await discoverAgents(query, limit)
    return NextResponse.json({ query, intent, results: results.map((result) => ({ ...toUiAgent(result.agent as never), matchScore: result.matchScore, reasons: result.reasons, evaluation: result.evaluation })) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Discovery is unavailable.' }, { status: 503 })
  }
}
