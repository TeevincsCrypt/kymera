import { NextResponse } from 'next/server'
import { requireWallet } from '@/lib/auth/require'
import { authorizeAction } from '@/lib/guard/execute'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * The one authorization endpoint. It returns a prepared transaction ONLY when Guard
 * approved the request; on rejection `transaction` is null and the client has nothing
 * to sign. The wallet is never prompted for a rejected action.
 *
 * Note that the acting wallet comes from the authenticated session cookie, never from
 * the request body — a caller cannot request authorization on someone else's behalf.
 */
export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, 'guard-authorize'), 30, 60_000)
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds)

  const auth = await requireWallet()
  if ('response' in auth) return auth.response

  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>

    const result = await authorizeAction({
      wallet: auth.address,
      agentId: typeof body.agentId === 'string' ? body.agentId : null,
      sessionId: typeof body.sessionId === 'string' ? body.sessionId : null,
      chainId: Number(body.chainId),
      walletChainId: body.walletChainId === undefined ? null : Number(body.walletChainId),
      action: String(body.action ?? ''),
      token: typeof body.token === 'string' ? body.token : null,
      tokenOut: typeof body.tokenOut === 'string' ? body.tokenOut : null,
      decimals: body.decimals === undefined ? null : Number(body.decimals),
      amount: body.amount === undefined || body.amount === null ? null : String(body.amount),
      slippageBps: body.slippageBps === undefined ? null : Number(body.slippageBps),
      feeTier: body.feeTier === undefined ? null : Number(body.feeTier),
      description: typeof body.description === 'string' ? body.description : null,
      provider: typeof body.provider === 'string' ? body.provider : null,
    })

    return NextResponse.json(
      {
        allowed: result.decision.allowed,
        reason: result.decision.reason,
        message: result.decision.message,
        checks: result.decision.checks,
        metadata: result.decision.metadata,
        executionId: result.executionId,
        transaction: result.transaction,
        simulation: result.simulation,
      },
      { status: result.decision.allowed ? 200 : 403 },
    )
  } catch {
    return NextResponse.json(
      { allowed: false, reason: 'GUARD_UNAVAILABLE', message: 'Guard could not complete its checks. No transaction was prepared.', checks: [], transaction: null },
      { status: 503 },
    )
  }
}
