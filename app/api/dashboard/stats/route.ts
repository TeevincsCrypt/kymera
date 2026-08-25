import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireWallet } from '@/lib/auth/require'
import { allowedChainIds, mainnetEnabled } from '@/lib/guard/policy'
import { paymentsAreDemo } from '@/lib/payments'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireWallet()
  if ('response' in auth) return auth.response
  const wallet = auth.address

  const [agents, evaluated, hires, sessions, authorized, blocked, confirmed] = await Promise.all([
    prisma.agent.count(),
    prisma.agentEvaluation.count({ where: { sufficientEvidence: true } }),
    prisma.agentHire.count({ where: { userAddress: wallet, status: 'ACTIVE' } }),
    prisma.agentSession.count({ where: { userAddress: wallet, status: 'Active', expiresAt: { gt: new Date() } } }),
    prisma.guardExecution.count({ where: { walletAddress: wallet, decision: 'APPROVED' } }),
    prisma.guardExecution.count({ where: { walletAddress: wallet, decision: 'REJECTED' } }),
    prisma.guardExecution.count({ where: { walletAddress: wallet, status: 'CONFIRMED' } }),
  ])

  return NextResponse.json({
    stats: { agents, evaluated, hires, sessions, authorized, blocked, confirmed },
    posture: {
      guard: 'enforced',
      network: mainnetEnabled() ? 'testnet + mainnet' : 'testnet only',
      allowedChains: allowedChainIds(),
      payments: paymentsAreDemo() ? 'demo' : 'live',
      custody: 'user-signed only',
    },
  })
}
