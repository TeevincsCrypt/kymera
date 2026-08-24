import { NextResponse } from 'next/server'
import { requireWallet } from '@/lib/auth/require'
import { prisma } from '@/lib/prisma'
import { isGuardAction, normalizeAddress } from '@/lib/guard/policy'
import { altanaReasonCopy } from '@/lib/altana/config'
import { executeThroughAltana } from '@/lib/altana/execute'
import type { AltanaSessionRow } from '@/lib/altana/session'

export const dynamic = 'force-dynamic'

/**
 * Autonomous execution: Guard authorizes, then the Altana session key submits the exact
 * calldata Guard built. Nothing in the request body reaches the chain — the client names
 * an intent, and the server decides and constructs everything.
 */
export async function POST(request: Request) {
  const auth = await requireWallet()
  if ('response' in auth) return auth.response

  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
  const action = body.action
  if (!sessionId) return NextResponse.json({ error: 'A session is required for autonomous execution', code: 'SESSION_REQUIRED' }, { status: 400 })
  if (!isGuardAction(action)) return NextResponse.json({ error: 'Unsupported action', code: 'ACTION_NOT_SUPPORTED' }, { status: 400 })

  const session = await prisma.agentSession.findUnique({ where: { id: sessionId }, include: { permissions: true } })
  if (!session || normalizeAddress(session.userAddress) !== normalizeAddress(auth.address)) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }
  if (session.provider !== 'ALTANA' || !session.providerSessionId) {
    return NextResponse.json({ error: altanaReasonCopy('ALTANA_SESSION_NOT_GRANTED'), code: 'ALTANA_SESSION_NOT_GRANTED' }, { status: 400 })
  }

  const permissions = session.permissions.filter((entry) => entry.allowed).map((entry) => entry.permission)
  const result = await executeThroughAltana(
    {
      wallet: auth.address,
      agentId: session.agentId,
      sessionId: session.id,
      chainId: session.chainId,
      action,
      token: typeof body.token === 'string' ? body.token : null,
      tokenOut: typeof body.tokenOut === 'string' ? body.tokenOut : null,
      decimals: typeof body.decimals === 'number' ? body.decimals : null,
      amount: typeof body.amount === 'string' ? body.amount : null,
      slippageBps: typeof body.slippageBps === 'number' ? body.slippageBps : null,
      feeTier: typeof body.feeTier === 'number' ? body.feeTier : null,
      description: typeof body.description === 'string' ? body.description : null,
      provider: typeof body.provider === 'string' ? body.provider : null,
    },
    session as AltanaSessionRow,
    permissions,
  )

  // A Guard refusal is a successful, expected outcome of the product — reported as a
  // decision, not as a server error.
  if (!result.ok && result.stage === 'guard') {
    return NextResponse.json({ executed: false, blocked: true, decision: result.decision }, { status: 200 })
  }
  if (!result.ok) {
    return NextResponse.json({
      executed: false,
      blocked: false,
      decision: result.decision,
      error: altanaReasonCopy(result.reason),
      code: result.reason,
      detail: result.detail ?? null,
      executionId: result.executionId,
    }, { status: 503 })
  }

  return NextResponse.json({
    executed: true,
    blocked: false,
    decision: result.decision,
    executionId: result.executionId,
    txHash: result.txHash ?? null,
    callsId: result.callsId,
    status: result.status,
    explorerUrl: result.explorerUrl ?? null,
  })
}
