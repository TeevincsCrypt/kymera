import { NextResponse } from 'next/server'
import { getPancakeProvider } from '@/lib/pancakeswap/provider'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const search = url.searchParams.get('search') || ''
    const limit = Number(url.searchParams.get('limit') || 12)
    const provider = getPancakeProvider()
    const health = await provider.health()
    const opportunities = await provider.getPools(search, limit)
    return NextResponse.json({ status: health.status, source: health.source, opportunities, updatedAt: health.checkedAt })
  } catch (error) {
    const health = await getPancakeProvider().health()
    return NextResponse.json({ status: health.status, source: health.source, opportunities: [], updatedAt: health.checkedAt, error: error instanceof Error ? error.message : 'PancakeSwap unavailable' }, { status: 503 })
  }
}
