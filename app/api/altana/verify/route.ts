import { NextResponse } from 'next/server'
import { verifySession } from '@/lib/altana/provider'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    if (!body?.session?.id) return NextResponse.json({ error: 'session is required' }, { status: 400 })
    return NextResponse.json(await verifySession(body.session))
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid verification request' }, { status: 400 }) }
}
