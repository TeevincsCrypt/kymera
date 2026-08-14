import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  try {
    const body = await request.json() as { jobId?: string; txHash?: string; chainId?: number; from?: string; to?: string; value?: string; status?: string; blockNumber?: string; gasUsed?: string; effectiveGasPrice?: string; error?: string }
    if (body.chainId !== 97 || !body.txHash || !body.from || !body.to) return NextResponse.json({ error: 'INVALID_RECEIPT' }, { status: 400 })
    const data = { txHash: body.txHash, chainId: 97, network: 'BNB Smart Chain Testnet', client: body.from, provider: body.to, evaluator: body.to, budget: body.value ?? '0', status: body.status ?? 'SUBMITTED', simulated: false, from: body.from, to: body.to, value: body.value ?? '0', submittedAt: new Date(), confirmedAt: body.status === 'CONFIRMED' ? new Date() : null, blockNumber: body.blockNumber ? BigInt(body.blockNumber) : null, gasUsed: body.gasUsed ? BigInt(body.gasUsed) : null, effectiveGasPrice: body.effectiveGasPrice ? BigInt(body.effectiveGasPrice) : null, error: body.error ?? null }
    const job = body.jobId ? await prisma.agentJob.update({ where: { id: body.jobId }, data }) : await prisma.agentJob.create({ data })
    return NextResponse.json({ ok: true, jobId: job.id, txHash: job.txHash, status: job.status })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'RECEIPT_PERSISTENCE_FAILED' }, { status: 500 }) }
}
