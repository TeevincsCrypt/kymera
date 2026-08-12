import { NextResponse } from 'next/server'
import { getPancakeStatus, listPancakePools } from '@/lib/pancakeswap'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const search = url.searchParams.get('search') || ''
    const limit = Number(url.searchParams.get('limit') || 12)
    return NextResponse.json({ status: await getPancakeStatus(), pools: await listPancakePools(search, limit) })
  } catch (error) {
    return NextResponse.json({ status: await getPancakeStatus(), pools: [], error: error instanceof Error ? error.message : 'PancakeSwap unavailable' }, { status: 503 })
  }
}
