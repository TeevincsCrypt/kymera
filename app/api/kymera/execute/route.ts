import { NextResponse } from 'next/server'
import { executeKymera } from '@/lib/kymera/execution'

export async function POST(request: Request) {
  try {
    const body = await request.json() as { agentId?: string; sessionId?: string; userAddress?: unknown; action?: { action: string; target: string; method: string; value: number } }
    if (typeof body.userAddress !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(body.userAddress)) return NextResponse.json({ error: 'A connected wallet address is required' }, { status: 400 })
    if (!body.action || typeof body.action !== 'object') return NextResponse.json({ error: 'A wallet-signed action is required' }, { status: 400 })
    return NextResponse.json(await executeKymera({ agentId: body.agentId, sessionId: body.sessionId, userAddress: body.userAddress, action: body.action as never }))
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Execution rejected' }, { status: 400 }) }
}
