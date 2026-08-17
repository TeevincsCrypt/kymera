import { NextResponse } from 'next/server'
import { getPancakeStatus } from '@/lib/pancakeswap'

export async function GET() {
  const status = await getPancakeStatus()
  return NextResponse.json(status, { status: status.sourceStatus === 'healthy' ? 200 : 503 })
}
