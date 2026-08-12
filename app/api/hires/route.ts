import { NextRequest, NextResponse } from 'next/server'
import { createHire, listHires } from '@/lib/hiring'

export async function GET(request: NextRequest) {
  const userAddress = request.nextUrl.searchParams.get('userAddress') || '0xDemoWallet'
  return NextResponse.json(await listHires(userAddress))
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const hire = await createHire(body)
    return NextResponse.json({ hire, demo: true, message: 'Hire created. Demo payment verification is available for this simulation.' }, { status: 201 })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create hire' }, { status: 400 }) }
}
