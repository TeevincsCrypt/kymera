import { NextResponse } from 'next/server'
import { requireWallet } from '@/lib/auth/require'
import { prisma } from '@/lib/prisma'
import { normalizeAddress } from '@/lib/guard/policy'
import { altanaReasonCopy } from '@/lib/altana/config'
import { grantAltanaSession, revokeAltanaSession, verifyAltanaSession, type AltanaSessionRow } from '@/lib/altana/session'
import { buildAltanaPermissions } from '@/lib/altana/permissions'

export const dynamic = 'force-dynamic'

/** Loads a session only if the authenticated wallet owns it. Otherwise null, always. */
async function ownedSession(id: string, address: string) {
  const session = await prisma.agentSession.findUnique({
    where: { id },
    include: { permissions: true, agent: { select: { id: true, name: true } } },
  })
  if (!session || normalizeAddress(session.userAddress) !== normalizeAddress(address)) return null
  return session
}

function grantedPermissions(session: { permissions: Array<{ permission: string; allowed: boolean }> }) {
  return session.permissions.filter((entry) => entry.allowed).map((entry) => entry.permission)
}

/** Verify the delegation on-chain. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWallet()
  if ('response' in auth) return auth.response
  const session = await ownedSession((await params).id, auth.address)
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const permissions = grantedPermissions(session)
  const verification = await verifyAltanaSession(session as AltanaSessionRow, permissions)
  const scope = buildAltanaPermissions({
    chainId: session.chainId,
    permissions,
    spendingLimit: session.spendingLimit == null ? null : Number(session.spendingLimit),
    expiresAt: session.expiresAt,
  })
  return NextResponse.json({
    ...verification,
    message: verification.reason ? altanaReasonCopy(verification.reason) : null,
    protocols: scope.protocols,
    methods: scope.methods,
  })
}

/** Delegate this Guard session to an Altana session key, on-chain. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWallet()
  if ('response' in auth) return auth.response
  const session = await ownedSession((await params).id, auth.address)
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.status !== 'Active') return NextResponse.json({ error: 'This session is no longer active', code: 'SESSION_INACTIVE' }, { status: 400 })
  if (session.expiresAt.getTime() <= Date.now()) return NextResponse.json({ error: 'This session has expired', code: 'SESSION_EXPIRED' }, { status: 400 })

  const result = await grantAltanaSession({
    id: session.id,
    chainId: session.chainId,
    expiresAt: session.expiresAt,
    spendingLimit: session.spendingLimit == null ? null : Number(session.spendingLimit),
    permissions: grantedPermissions(session),
  })

  if (!result.ok) {
    return NextResponse.json({ error: altanaReasonCopy(result.reason), code: result.reason, detail: result.detail ?? null }, { status: 503 })
  }
  return NextResponse.json(result)
}

/**
 * Revoke the on-chain delegation. Kymera's own session revocation is a separate,
 * always-available action (POST /api/sessions/[id]) that never depends on the relay.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWallet()
  if ('response' in auth) return auth.response
  const session = await ownedSession((await params).id, auth.address)
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const result = await revokeAltanaSession(session as AltanaSessionRow)
  if (!result.ok) {
    return NextResponse.json({ error: altanaReasonCopy(result.reason), code: result.reason, detail: result.detail ?? null }, { status: 503 })
  }
  await prisma.agentSession.update({ where: { id: session.id }, data: { providerSessionId: null } })
  return NextResponse.json({ revoked: true, txHash: result.txHash ?? null })
}
