import { NextResponse } from 'next/server'
import { execute } from '@/lib/altana/provider'
import { evaluateSession, type AltanaAction, type AltanaSession } from '@/lib/altana/domain'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const session = body.session as AltanaSession
    const action = body.action as AltanaAction
    if (!session?.agentId || !session?.wallet || !action?.target || !action?.method) return NextResponse.json({ error: 'agentId, wallet, target, and method are required' }, { status: 400 })
    const guard = evaluateSession(session, action)
    if (!guard.approved) return NextResponse.json({ approved: false, simulated: true, blockedBy: 'KYМERA_GUARD', reason: guard.reason }, { status: 403 })
    return NextResponse.json(await execute(session, action))
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid execution request' }, { status: 400 }) }
}
