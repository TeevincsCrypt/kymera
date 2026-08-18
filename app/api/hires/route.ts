import { NextRequest, NextResponse } from 'next/server'
import { createHire, listHires } from '@/lib/hiring'

export async function GET(request: NextRequest) {
  const userAddress = request.nextUrl.searchParams.get('userAddress')
  if (!userAddress) return NextResponse.json({ hires: [], error: 'Connect a wallet to view connected agents' }, { status: 401 })
  return NextResponse.json(await listHires(userAddress))
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const hire = await createHire(body)
    return NextResponse.json({ hire }, { status: 201 })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create hire' }, { status: 400 }) }
}
