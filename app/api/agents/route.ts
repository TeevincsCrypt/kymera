import { NextRequest, NextResponse } from 'next/server'
import { getAgents, toUiAgent } from '@/lib/agent-repository'

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const page = Math.max(1, Number(params.get('page') || 1))
    const pageSize = Math.min(50, Math.max(1, Number(params.get('pageSize') || 20)))
    const records = await getAgents({ query: params.get('query') || undefined, category: params.get('category') || undefined, chain: params.get('chain') || undefined, verified: params.has('verified') ? params.get('verified') === 'true' : undefined, minScore: params.has('minScore') ? Number(params.get('minScore')) : undefined, sort: params.get('sort') === 'newest' ? 'newest' : 'score' })
    const items = records.slice((page - 1) * pageSize, page * pageSize).map(toUiAgent)
    return NextResponse.json({ items, page, pageSize, total: records.length, hasMore: page * pageSize < records.length, source: 'neon' })
  } catch { return NextResponse.json({ items: [], page: 1, pageSize: 20, total: 0, hasMore: false, source: 'unavailable' }, { status: 503 }) }
}
