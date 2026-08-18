import { NextResponse } from 'next/server'
import { getPancakeProvider } from '@/lib/pancakeswap/provider'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { task?: unknown }
    const task = typeof body.task === 'string' ? body.task.trim() : ''
    if (!task) return NextResponse.json({ error: 'Task is required' }, { status: 400 })
    const provider = getPancakeProvider()
    const health = await provider.health()
    const opportunities = await provider.getOpportunities(task)
    return NextResponse.json({ status: { configured: health.status === 'healthy', chain: health.chain, source: health.source ?? 'none', execution: 'wallet_signed' }, health, task, opportunities, updatedAt: new Date().toISOString() })
  } catch (error) {
    const health = await getPancakeProvider().health()
    return NextResponse.json({ status: { configured: health.status === 'healthy', chain: health.chain, source: health.source ?? 'none', execution: 'wallet_signed' }, health, opportunities: [], updatedAt: health.checkedAt, error: error instanceof Error ? error.message : health.details || 'PancakeSwap provider error' }, { status: 503 })
  }
}
