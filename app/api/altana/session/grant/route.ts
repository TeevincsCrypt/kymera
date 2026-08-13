import { NextResponse } from 'next/server'
import { grantSession } from '@/lib/altana/provider'
export async function POST(request: Request) { const body = await request.json().catch(() => null); if (!body?.agentId || !body?.wallet) return NextResponse.json({ error: 'agentId and wallet are required' }, { status: 400 }); return NextResponse.json(await grantSession()) }
