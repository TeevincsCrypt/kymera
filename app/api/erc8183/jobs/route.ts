import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const jobs = await prisma.agentJob.findMany({ orderBy: { createdAt: 'desc' }, take: 25 })
  return NextResponse.json({ jobs })
}
