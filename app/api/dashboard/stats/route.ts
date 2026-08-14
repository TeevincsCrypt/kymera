import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAltanaStatus } from '@/lib/altana/provider'

export async function GET(request: NextRequest) {
  const userAddress = request.nextUrl.searchParams.get('userAddress') || '0xDemoWallet'
  const [agents, evaluated, hires, sessions, executions, blocked] = await Promise.all([
    prisma.agent.count(),
    prisma.agentPerformance.count(),
    prisma.agentHire.count({ where: { userAddress, status: 'ACTIVE' } }),
    prisma.agentSession.count({ where: { userAddress, status: 'Active' } }),
    prisma.altanaExecution.count({ where: { wallet: { address: userAddress } } }),
    prisma.altanaExecution.count({ where: { wallet: { address: userAddress }, status: 'REJECTED' } }),
  ])
  const altana = getAltanaStatus()
  return NextResponse.json({ stats: { agents, evaluated, hires, sessions, executions, blocked }, security: { simulation: true, altana: altana.available, score: evaluated > 0, persistence: true } })
}
