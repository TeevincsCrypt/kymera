import { NextResponse } from 'next/server'
import { listPancakePools } from '@/lib/pancakeswap'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { poolId?: unknown; action?: unknown }
    const action = body.action === 'add_liquidity' || body.action === 'remove_liquidity' || body.action === 'swap' ? body.action : 'swap'
    const poolId = typeof body.poolId === 'string' ? body.poolId : ''
    if (!poolId) return NextResponse.json({ error: 'poolId is required' }, { status: 400 })
    const pool = (await listPancakePools('', 50)).find((item) => item.id === poolId)
    if (!pool) return NextResponse.json({ error: 'Pool not found in the live PancakeSwap source' }, { status: 404 })
    return NextResponse.json({ preview: { action, poolId: pool.id, chain: 'bsc', status: 'READY_FOR_WALLET_REVIEW', executable: true, reason: 'The client will simulate and request explicit wallet signatures before submission.' }, pool })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to prepare preview' }, { status: 503 })
  }
}
