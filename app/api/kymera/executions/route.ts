import { NextResponse } from 'next/server'
import { listExecutions } from '@/lib/kymera/execution'

export async function GET(request: Request) {
  const userAddress = new URL(request.url).searchParams.get('userAddress') || '0xDemoWallet'
  return NextResponse.json({ executions: await listExecutions(userAddress) })
}
