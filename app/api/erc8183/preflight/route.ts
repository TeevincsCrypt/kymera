import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ERC8183_ADDRESSES } from '@/lib/erc8183/testnet'

export async function POST(request: Request) {
  try {
    const body = await request.json() as { wallet?: string; chainId?: number; to?: string; method?: string; value?: string }
    const wallet = body.wallet?.toLowerCase()
    if (!wallet) return NextResponse.json({ ok: false, error: 'WALLET_REQUIRED' }, { status: 400 })
    if (body.chainId !== 97) return NextResponse.json({ ok: false, error: 'WRONG_NETWORK' }, { status: 403 })
    if (body.to?.toLowerCase() !== ERC8183_ADDRESSES.agenticCommerce.toLowerCase()) return NextResponse.json({ ok: false, error: 'CONTRACT_NOT_ALLOWLISTED' }, { status: 403 })
    if (body.method !== 'createJob') return NextResponse.json({ ok: false, error: 'METHOD_NOT_ALLOWLISTED' }, { status: 403 })
    if (body.value !== '0') return NextResponse.json({ ok: false, error: 'SPENDING_CAP_EXCEEDED' }, { status: 403 })
    const session = await prisma.agentSession.findFirst({ where: { userAddress: { equals: wallet, mode: 'insensitive' }, status: 'Active' }, orderBy: { createdAt: 'desc' }, include: { permissions: true } })
    if (!session) return NextResponse.json({ ok: false, error: 'GUARD_SESSION_NOT_FOUND' }, { status: 403 })
    if (session.expiresAt.getTime() <= Date.now()) return NextResponse.json({ ok: false, error: 'SESSION_EXPIRED' }, { status: 403 })
    const permission = session.permissions.find((item) => item.permission === 'submit_transactions' || item.permission === 'execute_trades')
    if (!permission?.allowed) return NextResponse.json({ ok: false, error: 'METHOD_NOT_ALLOWED_BY_SESSION' }, { status: 403 })
    return NextResponse.json({ ok: true, sessionId: session.id, guardStatus: 'APPROVED' })
  } catch { return NextResponse.json({ ok: false, error: 'GUARD_UNAVAILABLE' }, { status: 503 }) }
}
