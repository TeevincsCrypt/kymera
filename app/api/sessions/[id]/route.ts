import { NextResponse } from 'next/server'
import { requireWallet } from '@/lib/auth/require'
import { GuardInputError, getGuardSession, revokeGuardSession } from '@/lib/guard/sessions'

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

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWallet()
  if ('response' in auth) return auth.response
  try {
    const session = await revokeGuardSession((await params).id, auth.address)
    return NextResponse.json({ session })
  } catch (error) {
    if (error instanceof GuardInputError) {
      const status = error.code === 'SESSION_NOT_FOUND' ? 404 : error.code === 'WRONG_WALLET' ? 403 : 400
      return NextResponse.json({ error: error.message, code: error.code }, { status })
    }
    return NextResponse.json({ error: 'Unable to revoke session' }, { status: 400 })
  }
}
