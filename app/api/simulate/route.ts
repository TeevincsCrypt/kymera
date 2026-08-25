import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticatedWallet } from '@/lib/auth/require'
import { evaluateGuard } from '@/lib/guard/evaluate'
import { ERC8183_ADDRESSES, PANCAKE_V3_ROUTER, allowedChainIds, isGuardAction } from '@/lib/guard/policy'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * Guard dry-run.
 *
 * Runs the real canonical Guard against a hypothetical action and returns the exact
 * check-by-check result — without recording an authorization, reserving spending-cap
 * headroom, or preparing anything signable. This is a genuine preview of the
 * decision, not a mock: the same function decides real executions.
 */
export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, 'simulate'), 60, 60_000)
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds)

  try {
    const wallet = await authenticatedWallet()
    const body = await request.json().catch(() => ({})) as Record<string, unknown>

    const action = String(body.action ?? 'swap')
    if (!isGuardAction(action)) {
      return NextResponse.json({ error: `Unsupported action. Try one of: create_job, approve_token, swap.` }, { status: 400 })
    }

    const chainId = Number(body.chainId ?? allowedChainIds()[0])
    const agentId = typeof body.agentId === 'string' ? body.agentId : undefined
    const agent = agentId ? await prisma.agent.findUnique({ where: { id: agentId }, select: { id: true, name: true, category: true, kymeraScore: true, evaluationStatus: true } }) : null
    if (agentId && !agent) return NextResponse.json({ error: 'Agent was not found in the Kymera index.' }, { status: 404 })

    if (!wallet) {
      return NextResponse.json({
        dryRun: true,
        authenticated: false,
        agent,
        message: 'Sign in with your wallet to dry-run Guard against your own sessions.',
        decision: null,
      })
    }

    const to = action === 'create_job'
      ? ERC8183_ADDRESSES.agenticCommerce
      : action === 'approve_token'
        ? String(body.token ?? '')
        : (PANCAKE_V3_ROUTER[chainId] ?? '')
    const method = action === 'create_job' ? 'createJob' : action === 'approve_token' ? 'approve' : 'exactInputSingle'

    const decision = await evaluateGuard({
      wallet,
      agentId,
      sessionId: typeof body.sessionId === 'string' ? body.sessionId : null,
      chainId,
      action,
      to,
      method,
      amount: body.amount === undefined || body.amount === null ? '0' : String(body.amount),
      asset: typeof body.token === 'string' ? body.token : 'BNB',
      spender: action === 'approve_token' ? PANCAKE_V3_ROUTER[chainId] : undefined,
    })

    return NextResponse.json({
      dryRun: true,
      authenticated: true,
      agent,
      request: { action, chainId, to, method, amount: String(body.amount ?? '0') },
      decision: {
        allowed: decision.allowed,
        reason: decision.reason,
        message: decision.message,
        checks: decision.checks,
        metadata: decision.metadata,
      },
      disclaimer: 'This is the same Guard that authorizes real executions, run in read-only mode. Nothing was recorded and no transaction was prepared.',
    })
  } catch {
    return NextResponse.json({ error: 'Guard dry-run failed.' }, { status: 500 })
  }
}
