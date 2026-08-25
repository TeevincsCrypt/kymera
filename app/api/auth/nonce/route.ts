import { NextResponse } from 'next/server'
import { buildSiweMessage, issueNonce } from '@/lib/auth/siwe'
import { BSC_TESTNET_CHAIN_ID, allowedChainIds, isAddress, normalizeAddress } from '@/lib/guard/policy'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

function originOf(request: Request) {
  const url = new URL(request.url)
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host
  const proto = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '')
  return { domain: host, uri: `${proto}://${host}` }
}

export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, 'auth-nonce'), 20, 60_000)
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds)

  try {
    const body = await request.json().catch(() => ({})) as { address?: unknown; chainId?: unknown }
    const address = typeof body.address === 'string' ? normalizeAddress(body.address) : ''
    if (!isAddress(address)) return NextResponse.json({ error: 'A valid wallet address is required.' }, { status: 400 })

    const requested = Number(body.chainId)
    const chainId = allowedChainIds().includes(requested) ? requested : BSC_TESTNET_CHAIN_ID
    const { domain, uri } = originOf(request)
    const { nonce, expiresAt } = await issueNonce(address)
    const issuedAt = new Date().toISOString()
    const message = buildSiweMessage({ domain, address, uri, chainId, nonce, issuedAt })

    return NextResponse.json({ message, nonce, issuedAt, chainId, expiresAt })
  } catch {
    return NextResponse.json({ error: 'Could not start sign-in. Try again.' }, { status: 503 })
  }
}
