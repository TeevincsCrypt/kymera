import { NextResponse } from 'next/server'
import { requireWallet } from '@/lib/auth/require'
import { HireInputError, getHire, settleHire } from '@/lib/hiring'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWallet()
  if ('response' in auth) return auth.response
  const hire = await getHire((await params).id, auth.address)
  return hire ? NextResponse.json({ hire }) : NextResponse.json({ error: 'Hire not found' }, { status: 404 })
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWallet()
  if ('response' in auth) return auth.response
  try {
    const result = await settleHire((await params).id, auth.address)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof HireInputError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === 'HIRE_NOT_FOUND' ? 404 : 400 })
    }
    return NextResponse.json({ error: 'Unable to settle hire' }, { status: 400 })
  }
}
