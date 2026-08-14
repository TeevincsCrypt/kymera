import { NextResponse } from 'next/server'
import { verifyTestnetIdentity } from '@/lib/erc8004/testnet'

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('agentId')
  if (!id || !/^\d+$/.test(id)) return NextResponse.json({ error: 'agentId must be a numeric token id' }, { status: 400 })
  return NextResponse.json(await verifyTestnetIdentity(BigInt(id)))
}
