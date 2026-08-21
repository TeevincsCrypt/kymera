import { NextResponse } from 'next/server'
import { verifySiwe } from '@/lib/auth/siwe'
import { AUTH_COOKIE, issueSessionToken, sessionCookieOptions } from '@/lib/auth/session'
import { BSC_TESTNET_CHAIN_ID } from '@/lib/guard/policy'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

function originOf(request: Request) {
  const url = new URL(request.url)
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host
  const proto = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '')
  return { domain: host, uri: `${proto}://${host}` }
}

export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, 'auth-verify'), 20, 60_000)
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds)

  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const { domain, uri } = originOf(request)

    const result = await verifySiwe({
      address: String(body.address ?? ''),
      signature: String(body.signature ?? ''),
      nonce: String(body.nonce ?? ''),
      issuedAt: String(body.issuedAt ?? ''),
      chainId: Number(body.chainId ?? BSC_TESTNET_CHAIN_ID),
      domain,
      uri,
    })

    if (!result.ok) {
      return NextResponse.json({ error: 'Wallet signature could not be verified.', code: result.error }, { status: 401 })
    }

    const { token, expiresAt } = issueSessionToken(result.address)
    const response = NextResponse.json({ address: result.address, expiresAt: expiresAt.toISOString() })
    response.cookies.set(AUTH_COOKIE, token, sessionCookieOptions(expiresAt))
    return response
  } catch (error) {
    const message = error instanceof Error && error.message.includes('KYMERA_AUTH_SECRET')
      ? 'Server authentication secret is not configured.'
      : 'Could not complete sign-in.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
