import { NextResponse } from 'next/server'
import { getPancakeProvider } from '@/lib/pancakeswap/provider'

export async function POST(request: Request) {
  try {
    const body = await request.json() as { task?: string }
    const task = String(body.task || '').trim()
    if (!task) return NextResponse.json({ error: 'Task is required' }, { status: 400 })
    const provider = getPancakeProvider()
    const health = await provider.health()
    return NextResponse.json({ status: health.status, source: health.source, task, opportunities: await provider.getOpportunities(task), updatedAt: health.checkedAt })
  } catch (error) {
    const health = await getPancakeProvider().health()
    return NextResponse.json({ status: health.status, source: health.source, opportunities: [], updatedAt: health.checkedAt, error: error instanceof Error ? error.message : 'PancakeSwap unavailable' }, { status: 503 })
  }
}
