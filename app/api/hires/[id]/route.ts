import { NextRequest, NextResponse } from 'next/server'
import { getHire, verifyHirePayment } from '@/lib/hiring'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userAddress = request.nextUrl.searchParams.get('userAddress') || '0xDemoWallet'
  const hire = await getHire(id, userAddress)
  return hire ? NextResponse.json(hire) : NextResponse.json({ error: 'Hire not found' }, { status: 404 })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const hire = await verifyHirePayment(id, body.userAddress || '0xDemoWallet')
    return NextResponse.json({ hire, demo: true })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to verify hire payment' }, { status: 400 }) }
}
