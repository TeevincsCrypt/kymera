import { NextRequest, NextResponse } from 'next/server'
import { countAgents, getAgents, toUiAgent } from '@/lib/agent-repository'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const page = Math.max(1, Number(params.get('page') || 1))
    const pageSize = Math.min(50, Math.max(1, Number(params.get('pageSize') || 20)))
    const minScoreParam = params.get('minScore')

    const filters = {
      query: params.get('query') || undefined,
      category: params.get('category') || undefined,
      chain: params.get('chain') || undefined,
      verified: params.has('verified') ? params.get('verified') === 'true' : undefined,
      trustTier: params.get('trustTier') || undefined,
      minScore: minScoreParam !== null && minScoreParam !== '' ? Number(minScoreParam) : undefined,
      sort: params.get('sort') === 'newest' ? ('newest' as const) : ('score' as const),
    }

    // Pagination happens in the database rather than by slicing a full table read.
    const [records, total] = await Promise.all([
      getAgents({ ...filters, take: pageSize, skip: (page - 1) * pageSize }),
      countAgents(filters),
    ])

    return NextResponse.json({
      items: records.map((record) => toUiAgent(record)),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
      source: 'neon',
    })
  } catch {
    return NextResponse.json(
      { items: [], page: 1, pageSize: 20, total: 0, hasMore: false, source: 'unavailable', error: 'The agent catalog is unavailable right now.' },
      { status: 503 },
    )
  }
}
