import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireWallet } from '@/lib/auth/require'

export const dynamic = 'force-dynamic'

/**
 * ERC-8183 jobs for the authenticated wallet. Scoped deliberately: these rows carry
 * wallet addresses, so an unscoped listing would leak every user's activity.
 */
export async function GET() {
  const auth = await requireWallet()
  if ('response' in auth) return auth.response

  const jobs = await prisma.agentJob.findMany({
    where: { client: { equals: auth.address, mode: 'insensitive' } },
    orderBy: { createdAt: 'desc' },
    take: 25,
  })

  return NextResponse.json({
    jobs: jobs.map((job) => ({
      id: job.id,
      chainId: job.chainId,
      network: job.network,
      status: job.status,
      txHash: job.txHash,
      blockNumber: job.blockNumber ? job.blockNumber.toString() : null,
      gasUsed: job.gasUsed ? job.gasUsed.toString() : null,
      submittedAt: job.submittedAt,
      confirmedAt: job.confirmedAt,
      error: job.error,
    })),
  })
}
