import { NextResponse } from 'next/server'
import { revokeSession } from '@/lib/altana/provider'
export async function POST(request: Request) { const body = await request.json().catch(() => null); if (!body?.sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 }); return NextResponse.json(await revokeSession()) }
