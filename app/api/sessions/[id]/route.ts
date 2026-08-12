import { NextRequest, NextResponse } from 'next/server'
import { getGuardSession, revokeGuardSession } from '@/lib/guard'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getGuardSession((await params).id)
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  return NextResponse.json({ session })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json()
    const session = await revokeGuardSession((await params).id, String(body.userAddress || 'unknown'))
    return NextResponse.json({ session })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to revoke session' }, { status: 400 })
  }
}
