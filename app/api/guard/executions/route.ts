import { NextResponse } from 'next/server'
import { requireWallet } from '@/lib/auth/require'
import { listExecutions } from '@/lib/guard/execute'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireWallet()
  if ('response' in auth) return auth.response
  const limit = Number(new URL(request.url).searchParams.get('limit') || 30)
  const executions = await listExecutions(auth.address, limit)
  return NextResponse.json({
    executions: executions.map((execution) => ({
      id: execution.id,
      agent: execution.agent,
      action: execution.action,
      decision: execution.decision,
      reason: execution.reason,
      status: execution.status,
      chainId: execution.chainId,
      asset: execution.asset,
      amount: execution.amount.toString(),
      toAddress: execution.toAddress,
      method: execution.method,
      txHash: execution.txHash,
      createdAt: execution.createdAt,
      confirmedAt: execution.confirmedAt,
      error: execution.error,
    })),
  })
}
