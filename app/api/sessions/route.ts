import { NextResponse } from 'next/server'
import { requireWallet } from '@/lib/auth/require'
import { GuardInputError, createGuardSession, listGuardSessions } from '@/lib/guard/sessions'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireWallet()
  if ('response' in auth) return auth.response
  return NextResponse.json({ sessions: await listGuardSessions(auth.address) })
}

export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, 'session-create'), 20, 60_000)
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds)

  const auth = await requireWallet()
  if ('response' in auth) return auth.response

  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const session = await createGuardSession({
      agentId: String(body.agentId || ''),
      // The wallet is taken from the authenticated session, never from the body.
      userAddress: auth.address,
      spendingLimit: body.spendingLimit === undefined || body.spendingLimit === null || body.spendingLimit === '' ? undefined : Number(body.spendingLimit),
      durationHours: Number(body.durationHours),
      permissions: Array.isArray(body.permissions) ? body.permissions.map(String) : [],
      chainId: body.chainId === undefined ? undefined : Number(body.chainId),
    })
    return NextResponse.json({ session }, { status: 201 })
  } catch (error) {
    if (error instanceof GuardInputError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 })
    return NextResponse.json({ error: 'Unable to create Guard session' }, { status: 400 })
  }
}
