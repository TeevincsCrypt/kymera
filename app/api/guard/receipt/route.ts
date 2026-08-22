import { NextResponse } from 'next/server'
import { requireWallet } from '@/lib/auth/require'
import { cancelAuthorization, recordConfirmation, recordSubmission } from '@/lib/guard/execute'
import { prisma } from '@/lib/prisma'
import { activateHireFromPayment } from '@/lib/hiring'

export const dynamic = 'force-dynamic'

/**
 * Records what happened to a Guard-authorized transaction. Ownership of the
 * execution row is re-checked against the authenticated wallet, so one wallet cannot
 * write receipts against another's authorization.
 */
export async function POST(request: Request) {
  const auth = await requireWallet()
  if ('response' in auth) return auth.response

  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const executionId = String(body.executionId ?? '')
    const stage = String(body.stage ?? '')
    if (!executionId) return NextResponse.json({ error: 'executionId is required' }, { status: 400 })

    if (stage === 'submitted') {
      const execution = await recordSubmission(executionId, auth.address, String(body.txHash ?? ''))
      await writeJobProjection(execution.id)
      return NextResponse.json({ ok: true, status: execution.status, txHash: execution.txHash })
    }

    if (stage === 'confirmed' || stage === 'failed') {
      const execution = await recordConfirmation(executionId, auth.address, {
        success: stage === 'confirmed',
        blockNumber: body.blockNumber ? String(body.blockNumber) : null,
        gasUsed: body.gasUsed ? String(body.gasUsed) : null,
        effectiveGasPrice: body.effectiveGasPrice ? String(body.effectiveGasPrice) : null,
        error: stage === 'failed' ? String(body.error ?? 'TRANSACTION_REVERTED') : null,
      })
      await writeJobProjection(execution.id)
      // A confirmed hire payment is what actually activates the engagement, so the
      // hire is only ever marked paid against a real, mined transaction.
      let hire = null
      if (stage === 'confirmed' && execution.action === 'hire_payment' && execution.hireId) {
        hire = await activateHireFromPayment({
          hireId: execution.hireId,
          userAddress: auth.address,
          chainId: execution.chainId,
          txHash: execution.txHash ?? '',
          recipient: execution.toAddress,
          amountWei: execution.valueWei,
        }).catch(() => null)
      }
      return NextResponse.json({ ok: true, status: execution.status, hire: hire?.hire ?? null, sessionId: hire?.sessionId ?? null })
    }

    if (stage === 'cancelled') {
      const execution = await cancelAuthorization(executionId, auth.address)
      return NextResponse.json({ ok: true, status: execution.status })
    }

    return NextResponse.json({ error: 'stage must be submitted, confirmed, failed, or cancelled' }, { status: 400 })
  } catch (error) {
    const code = error instanceof Error ? error.message : 'RECEIPT_FAILED'
    const status = code === 'WRONG_WALLET' ? 403 : code === 'EXECUTION_NOT_FOUND' ? 404 : 400
    return NextResponse.json({ error: code }, { status })
  }
}

/**
 * ERC-8183 job rows are a read-model projection of the canonical ledger, kept so the
 * jobs view keeps working. GuardExecution remains the source of truth.
 */
async function writeJobProjection(executionId: string) {
  try {
    const execution = await prisma.guardExecution.findUnique({ where: { id: executionId } })
    if (!execution || execution.action !== 'create_job' || !execution.txHash) return
    await prisma.agentJob.upsert({
      where: { txHash: execution.txHash },
      update: {
        status: execution.status,
        confirmedAt: execution.confirmedAt,
        blockNumber: execution.blockNumber,
        gasUsed: execution.gasUsed,
        effectiveGasPrice: execution.effectiveGasPrice,
        error: execution.error,
      },
      create: {
        chainId: execution.chainId,
        network: execution.chainId === 97 ? 'BNB Smart Chain Testnet' : 'BNB Smart Chain',
        client: execution.walletAddress,
        provider: execution.toAddress,
        evaluator: execution.toAddress,
        budget: 0,
        status: execution.status,
        simulated: false,
        txHash: execution.txHash,
        from: execution.walletAddress,
        to: execution.toAddress,
        value: 0,
        submittedAt: execution.submittedAt,
        confirmedAt: execution.confirmedAt,
        blockNumber: execution.blockNumber,
        gasUsed: execution.gasUsed,
        effectiveGasPrice: execution.effectiveGasPrice,
        error: execution.error,
      },
    })
  } catch {
    // The projection is a convenience view; failing it must not fail the receipt.
  }
}
