import { NextResponse } from 'next/server'
import { requireWallet } from '@/lib/auth/require'
import { GuardInputError, getGuardSession, narrowGuardSession, pauseGuardSession, revokeGuardSession } from '@/lib/guard/sessions'
import { prisma } from '@/lib/prisma'
import { altanaReasonCopy } from '@/lib/altana/config'
import { grantAltanaSession, revokeAltanaSession, type AltanaSessionRow } from '@/lib/altana/session'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWallet()
  if ('response' in auth) return auth.response
  // getGuardSession returns null for sessions owned by another wallet, so a wrong
  // guess is indistinguishable from a missing id.
  const session = await getGuardSession((await params).id, auth.address)
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  return NextResponse.json({ session })
}

/**
 * Revoke. Kymera's own revocation happens first and never depends on the network: from
 * that moment Guard refuses everything for this session and cancels any authorization
 * that was approved but not yet signed. The on-chain delegation is then revoked too, and
 * if that cannot be reached the response says so plainly instead of implying it worked.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWallet()
  if ('response' in auth) return auth.response
  const id = (await params).id
  try {
    const delegated = await prisma.agentSession.findUnique({
      where: { id },
      select: { id: true, chainId: true, expiresAt: true, status: true, spendingLimit: true, provider: true, walletAddress: true, providerSessionId: true, network: true, grantTxHash: true, verificationUrl: true },
    })
    const session = await revokeGuardSession(id, auth.address)

    let delegation: { onChainRevoked: boolean; txHash?: string | null; code?: string; message?: string } | null = null
    if (delegated?.provider === 'ALTANA' && delegated.providerSessionId) {
      const result = await revokeAltanaSession(delegated as AltanaSessionRow)
      delegation = result.ok
        ? { onChainRevoked: true, txHash: result.txHash ?? null }
        : { onChainRevoked: false, code: result.reason, message: `${altanaReasonCopy(result.reason)} Kymera has already stopped authorizing anything for this session.` }
      if (result.ok) await prisma.agentSession.update({ where: { id }, data: { providerSessionId: null } })
    }

    return NextResponse.json({ session, delegation })
  } catch (error) {
    return guardError(error, 'Unable to revoke session')
  }
}

/** Pause or resume. Body: { paused: boolean }. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWallet()
  if ('response' in auth) return auth.response
  const body = await request.json().catch(() => null) as { paused?: unknown } | null
  if (typeof body?.paused !== 'boolean') return NextResponse.json({ error: 'paused must be true or false' }, { status: 400 })
  try {
    const session = await pauseGuardSession((await params).id, auth.address, body.paused)
    return NextResponse.json({ session })
  } catch (error) {
    return guardError(error, 'Unable to change this session')
  }
}

/**
 * Narrow a live session. Widening is refused by `narrowGuardSession`.
 *
 * When the session carries an Altana delegation, the on-chain grant is re-issued with
 * the reduced scope so the key's real authority matches what the page shows. If that
 * cannot be reached, the response says so explicitly rather than implying the on-chain
 * scope shrank when it did not — Kymera refuses the removed permissions either way.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWallet()
  if ('response' in auth) return auth.response
  const body = await request.json().catch(() => null) as { permissions?: unknown; spendingLimit?: unknown } | null
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const permissions = Array.isArray(body.permissions) && body.permissions.every((item) => typeof item === 'string')
    ? (body.permissions as string[])
    : undefined
  const spendingLimit = body.spendingLimit === undefined ? undefined
    : body.spendingLimit === null ? null
    : typeof body.spendingLimit === 'number' ? body.spendingLimit
    : NaN
  if (Number.isNaN(spendingLimit)) return NextResponse.json({ error: 'spendingLimit must be a number or null' }, { status: 400 })

  const id = (await params).id
  try {
    const session = await narrowGuardSession(id, auth.address, { permissions, spendingLimit })
    const delegation = await regrantAltanaScope(id)
    return NextResponse.json({ session, delegation })
  } catch (error) {
    return guardError(error, 'Unable to update this session')
  }
}

/**
 * Re-issue the on-chain delegation after a narrowing. Returns null when the session was
 * never delegated to Altana, so a plain Guard session is unaffected.
 */
async function regrantAltanaScope(id: string) {
  const session = await prisma.agentSession.findUnique({ where: { id }, include: { permissions: true } })
  if (!session || session.provider !== 'ALTANA' || !session.providerSessionId) return null

  const revoked = await revokeAltanaSession(session as AltanaSessionRow)
  if (!revoked.ok) {
    return { onChainUpdated: false, code: revoked.reason, message: `${altanaReasonCopy(revoked.reason)} Kymera refuses the removed permissions immediately, but the on-chain delegation still carries its previous scope.` }
  }

  const granted = await grantAltanaSession({
    id: session.id,
    chainId: session.chainId,
    expiresAt: session.expiresAt,
    spendingLimit: session.spendingLimit == null ? null : Number(session.spendingLimit),
    permissions: session.permissions.filter((entry) => entry.allowed).map((entry) => entry.permission),
  })
  if (!granted.ok) {
    return { onChainUpdated: false, code: granted.reason, message: `The previous on-chain delegation was revoked, but the narrowed one could not be granted: ${altanaReasonCopy(granted.reason)} This agent cannot execute autonomously until it is re-activated.` }
  }
  return { onChainUpdated: true, txHash: granted.txHash ?? null, explorerUrl: granted.explorerUrl ?? null }
}

function guardError(error: unknown, fallback: string) {
  if (error instanceof GuardInputError) {
    const status = error.code === 'SESSION_NOT_FOUND' ? 404 : error.code === 'WRONG_WALLET' ? 403 : 400
    return NextResponse.json({ error: error.message, code: error.code }, { status })
  }
  return NextResponse.json({ error: fallback }, { status: 400 })
}
