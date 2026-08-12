import { NextRequest, NextResponse } from 'next/server'
import { createGuardSession, listGuardSessions } from '@/lib/guard'

export async function GET(request: NextRequest) {
  const userAddress = request.nextUrl.searchParams.get('userAddress') || undefined
  return NextResponse.json({ sessions: await listGuardSessions(userAddress) })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const session = await createGuardSession({ agentId: String(body.agentId || ''), userAddress: String(body.userAddress || ''), spendingLimit: body.spendingLimit === undefined ? undefined : Number(body.spendingLimit), durationHours: Number(body.durationHours), permissions: Array.isArray(body.permissions) ? body.permissions.map(String) : [] })
    return NextResponse.json({ session }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create Guard session' }, { status: 400 })
  }
}
