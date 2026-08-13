import { NextResponse } from 'next/server'
import { createWallet } from '@/lib/altana/provider'
export async function POST() { return NextResponse.json(await createWallet()) }
