import { NextResponse } from 'next/server'
import { buildUnsignedActionPreview, listPancakePools } from '@/lib/pancakeswap'

export async function POST(request: Request) {
  try {
    const body = await request.json() as { poolId?: string; action?: 'add_liquidity' | 'remove_liquidity' | 'swap' }
    const action = body.action || 'swap'
    if (!body.poolId) return NextResponse.json({ error: 'poolId is required' }, { status: 400 })
    const pool = (await listPancakePools('', 50)).find((item) => item.id === body.poolId)
    if (!pool) return NextResponse.json({ error: 'Pool not found in the live PancakeSwap source' }, { status: 404 })
    return NextResponse.json({ preview: buildUnsignedActionPreview(pool, action), pool })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to prepare preview' }, { status: 503 })
  }
}
