import { NextResponse } from 'next/server'
import { requireWallet } from '@/lib/auth/require'
import { HireInputError, createHire, listHires } from '@/lib/hiring'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireWallet()
  if ('response' in auth) return auth.response
  return NextResponse.json({ hires: await listHires(auth.address) })
}

export async function POST(request: Request) {
  const auth = await requireWallet()
  if ('response' in auth) return auth.response
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const hire = await createHire({
      agentId: String(body.agentId || ''),
      userAddress: auth.address,
      task: String(body.task || ''),
      amount: body.amount === undefined ? undefined : Number(body.amount),
      requestedPermissions: Array.isArray(body.requestedPermissions) ? body.requestedPermissions.map(String) : undefined,
      benchmarkId: typeof body.benchmarkId === 'string' ? body.benchmarkId : undefined,
    })
    return NextResponse.json({ hire }, { status: 201 })
  } catch (error) {
    if (error instanceof HireInputError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 })
    return NextResponse.json({ error: 'Unable to create hire' }, { status: 400 })
  }
}
