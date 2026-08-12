import { NextResponse } from 'next/server'
import { getPancakeOpportunities, getPancakeStatus } from '@/lib/pancakeswap'

export async function POST(request: Request) {
  try {
    const body = await request.json() as { task?: string }
    const task = String(body.task || '').trim()
    if (!task) return NextResponse.json({ error: 'Task is required' }, { status: 400 })
    return NextResponse.json({ status: await getPancakeStatus(), task, opportunities: await getPancakeOpportunities(task) })
  } catch (error) {
    return NextResponse.json({ status: await getPancakeStatus(), opportunities: [], error: error instanceof Error ? error.message : 'PancakeSwap unavailable' }, { status: 503 })
  }
}
