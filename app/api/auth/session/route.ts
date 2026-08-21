import { NextResponse } from 'next/server'
import { authenticatedWallet } from '@/lib/auth/require'

export const dynamic = 'force-dynamic'

export async function GET() {
  const address = await authenticatedWallet()
  return NextResponse.json({ authenticated: Boolean(address), address })
}
