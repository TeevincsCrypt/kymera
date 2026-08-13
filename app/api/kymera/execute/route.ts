import { NextResponse } from 'next/server'
import { executeKymera } from '@/lib/kymera/execution'

export async function POST(request: Request) {
  try { const body = await request.json(); return NextResponse.json(await executeKymera({ ...body, userAddress: String(body.userAddress || '0xDemoWallet') })) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Execution rejected' }, { status: 400 }) }
}
