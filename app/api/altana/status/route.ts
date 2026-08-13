import { NextResponse } from 'next/server'
import { getAltanaStatus } from '@/lib/altana/domain'

export async function GET() { return NextResponse.json({ ...getAltanaStatus(), guard: 'enabled' }) }
