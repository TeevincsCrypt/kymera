/**
 * Kymera Guard — authorization, transaction construction, and the execution ledger.
 *
 * The security model here is deliberate:
 *
 *   1. Guard decides (`evaluateGuard`). If it denies, nothing is prepared and the
 *      caller has no transaction to sign.
 *   2. If Guard approves, the SERVER builds the exact calldata and hashes it. The
 *      client never supplies calldata, so it cannot sign something other than what
 *      was authorized.
 *   3. The authorization is written to `GuardExecution` inside a serializable
 *      transaction that re-checks the spending cap, closing the concurrent-request race.
 *   4. Only then is the prepared transaction returned for the user's wallet to sign.
 */

import { createHash, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { encodeFunctionData, parseUnits, formatUnits, type Address, type Hex } from 'viem'
import { prisma } from '@/lib/prisma'
import { getServerPublicClient } from '@/lib/web3/server-client'
import { agenticCommerceAbi, erc20Abi, pancakeV3RouterAbi } from './abi'
import {
  ACTION_CONSUMES_CAP,
  ERC8183_ADDRESSES,
  GUARD_REASONS,
  GUARD_REASON_COPY,
  PANCAKE_V3_ROUTER,
  type GuardAction,
  normalizeAddress,
} from './policy'
import { NATIVE_ASSET, RESERVATION_WINDOW_MS, evaluateGuard, expireStaleReservations, spentForSession, type GuardCheck, type GuardDecision } from './evaluate'

const Decimal = Prisma.Decimal

export const DEFAULT_SLIPPAGE_BPS = 50
export const MAX_SLIPPAGE_BPS = 1000
const DEFAULT_FEE_TIER = 2500

export type PreparedTransaction = {
  chainId: number
  to: Address
  data: Hex
  value: string
  method: string
  action: GuardAction
  /** sha256 over chainId|to|data|value — recorded so tampering is detectable. */
  txDataHash: string
  summary: string
}

export type AuthorizeInput = {
  wallet: string
  agentId?: string | null
  sessionId?: string | null
  chainId: number
  action: string
  walletChainId?: number | null
  /** ERC-20 involved in the action (tokenIn for a swap, the token for an approval). */
  token?: string | null
  tokenOut?: string | null
  decimals?: number | null
  /** Human-readable amount, e.g. "0.25". */
  amount?: string | null
  slippageBps?: number | null
  feeTier?: number | null
  description?: string | null
  provider?: string | null
}

export type AuthorizeResult = {
  decision: GuardDecision
  executionId: string | null
  transaction: PreparedTransaction | null
  simulation: { attempted: boolean; ok: boolean; detail?: string; amountOut?: string } | null
}

function hashTransaction(chainId: number, to: string, data: string, value: string) {
  return createHash('sha256').update(`${chainId}|${normalizeAddress(to)}|${data.toLowerCase()}|${value}`).digest('hex')
}

function safeDecimals(value: number | null | undefined) {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 36 ? (value as number) : 18
}

/** Resolve the asset + amount that Guard should reason about for this action. */
function assetForAction(action: GuardAction, input: AuthorizeInput) {
  if (action === 'create_job') return { asset: NATIVE_ASSET, amount: '0' }
  return { asset: normalizeAddress(input.token) || NATIVE_ASSET, amount: input.amount ?? '0' }
}

/* ------------------------------------------------------------ tx construction */

function buildTransaction(action: GuardAction, input: AuthorizeInput, amountOutMinimum: bigint): PreparedTransaction {
  const chainId = Number(input.chainId)
  const decimals = safeDecimals(input.decimals)

  if (action === 'create_job') {
    const provider = (normalizeAddress(input.provider) || normalizeAddress(input.wallet)) as Address
    const description = (input.description || 'Kymera agent job').slice(0, 200)
    const expiredAt = BigInt(Math.floor(Date.now() / 1000) + 3600)
    const data = encodeFunctionData({
      abi: agenticCommerceAbi,
      functionName: 'createJob',
      args: [provider, ERC8183_ADDRESSES.evaluatorRouter as Address, expiredAt, description, ERC8183_ADDRESSES.evaluatorRouter as Address],
    })
    const to = ERC8183_ADDRESSES.agenticCommerce as Address
    return {
      chainId, to, data, value: '0', method: 'createJob', action,
      txDataHash: hashTransaction(chainId, to, data, '0'),
      summary: `Create an ERC-8183 agent job for provider ${provider.slice(0, 10)}… (0 BNB)`,
    }
  }

  if (action === 'approve_token') {
    const token = normalizeAddress(input.token) as Address
    const spender = PANCAKE_V3_ROUTER[chainId] as Address
    const amount = parseUnits(String(input.amount ?? '0'), decimals)
    const data = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, amount] })
    return {
      chainId, to: token, data, value: '0', method: 'approve', action,
      txDataHash: hashTransaction(chainId, token, data, '0'),
      summary: `Approve ${input.amount} of token ${token.slice(0, 10)}… for the PancakeSwap router`,
    }
  }

  // swap
  const router = PANCAKE_V3_ROUTER[chainId] as Address
  const tokenIn = normalizeAddress(input.token) as Address
  const tokenOut = normalizeAddress(input.tokenOut) as Address
  const amountIn = parseUnits(String(input.amount ?? '0'), decimals)
  const fee = Number.isInteger(input.feeTier) && (input.feeTier as number) > 0 ? (input.feeTier as number) : DEFAULT_FEE_TIER
  const data = encodeFunctionData({
    abi: pancakeV3RouterAbi,
    functionName: 'exactInputSingle',
    args: [{
      tokenIn, tokenOut, fee,
      recipient: normalizeAddress(input.wallet) as Address,
      amountIn,
      amountOutMinimum,
      sqrtPriceLimitX96: BigInt(0),
    }],
  })
  return {
    chainId, to: router, data, value: '0', method: 'exactInputSingle', action,
    txDataHash: hashTransaction(chainId, router, data, '0'),
    summary: `Swap ${input.amount} of ${tokenIn.slice(0, 10)}… for at least ${amountOutMinimum.toString()} base units of ${tokenOut.slice(0, 10)}…`,
  }
}

/* ---------------------------------------------------------------- simulation */

/**
 * Simulate the call on-chain before the wallet is ever prompted. For swaps this is
 * mandatory: it is how the minimum output (slippage floor) is established. Kymera
 * refuses to prepare a swap it could not simulate rather than defaulting the floor
 * to zero, which would authorize an unbounded-slippage trade.
 */
async function simulateSwapOutput(input: AuthorizeInput) {
  const chainId = Number(input.chainId)
  const client = getServerPublicClient(chainId)
  if (!client) return { attempted: false, ok: false, detail: 'No RPC client for this chain' }
  const decimals = safeDecimals(input.decimals)
  const router = PANCAKE_V3_ROUTER[chainId] as Address
  try {
    const result = await client.simulateContract({
      address: router,
      abi: pancakeV3RouterAbi,
      functionName: 'exactInputSingle',
      account: normalizeAddress(input.wallet) as Address,
      args: [{
        tokenIn: normalizeAddress(input.token) as Address,
        tokenOut: normalizeAddress(input.tokenOut) as Address,
        fee: Number.isInteger(input.feeTier) && (input.feeTier as number) > 0 ? (input.feeTier as number) : DEFAULT_FEE_TIER,
        recipient: normalizeAddress(input.wallet) as Address,
        amountIn: parseUnits(String(input.amount ?? '0'), decimals),
        amountOutMinimum: BigInt(0),
        sqrtPriceLimitX96: BigInt(0),
      }],
    })
    const amountOut = result.result as bigint
    return { attempted: true, ok: true, amountOut }
  } catch (error) {
    return { attempted: true, ok: false, detail: error instanceof Error ? error.message.split('\n')[0].slice(0, 300) : 'Simulation failed' }
  }
}

async function simulateGeneric(action: GuardAction, input: AuthorizeInput, tx: PreparedTransaction) {
  const client = getServerPublicClient(Number(input.chainId))
  if (!client) return { attempted: false, ok: false, detail: 'No RPC client for this chain' }
  try {
    await client.call({ account: normalizeAddress(input.wallet) as Address, to: tx.to, data: tx.data, value: BigInt(0) })
    return { attempted: true, ok: true }
  } catch (error) {
    return { attempted: true, ok: false, detail: error instanceof Error ? error.message.split('\n')[0].slice(0, 300) : 'Simulation failed' }
  }
}

/* --------------------------------------------------------------- authorize */

function denial(decision: GuardDecision): AuthorizeResult {
  return { decision, executionId: null, transaction: null, simulation: null }
}

/**
 * The single entry point every execution surface must use. Returns a prepared
 * transaction ONLY when Guard approved; otherwise `transaction` is null and the
 * caller must not prompt the wallet.
 */
export async function authorizeAction(input: AuthorizeInput): Promise<AuthorizeResult> {
  const action = input.action as GuardAction
  const { asset, amount } = assetForAction(action, input)

  const spender = action === 'approve_token' ? PANCAKE_V3_ROUTER[Number(input.chainId)] : undefined
  const target =
    action === 'create_job' ? ERC8183_ADDRESSES.agenticCommerce
    : action === 'approve_token' ? (input.token ?? '')
    : (PANCAKE_V3_ROUTER[Number(input.chainId)] ?? '')
  const method = action === 'create_job' ? 'createJob' : action === 'approve_token' ? 'approve' : 'exactInputSingle'

  const decision = await evaluateGuard({
    wallet: input.wallet,
    agentId: input.agentId,
    sessionId: input.sessionId,
    chainId: Number(input.chainId),
    walletChainId: input.walletChainId,
    action,
    to: target,
    method,
    amount,
    asset,
    spender,
  })

  if (!decision.allowed) {
    await recordRejection(decision, input)
    return denial(decision)
  }

  // Guard approved. Establish the slippage floor by simulation before preparing a swap.
  let simulation: AuthorizeResult['simulation'] = null
  let amountOutMinimum = BigInt(0)

  if (action === 'swap') {
    const sim = await simulateSwapOutput(input)
    if (!sim.ok || sim.amountOut === undefined) {
      const reason = sim.attempted ? GUARD_REASONS.SIMULATION_REVERTED : GUARD_REASONS.GUARD_UNAVAILABLE
      const failed: GuardDecision = {
        ...decision,
        allowed: false,
        reason,
        message: GUARD_REASON_COPY[reason],
        checks: [...decision.checks, { id: 'simulation', label: 'On-chain simulation', status: 'failed', detail: sim.detail }],
      }
      await recordRejection(failed, input)
      return denial(failed)
    }
    const bps = BigInt(Math.min(Math.max(Number(input.slippageBps ?? DEFAULT_SLIPPAGE_BPS), 0), MAX_SLIPPAGE_BPS))
    amountOutMinimum = (sim.amountOut * (BigInt(10_000) - bps)) / BigInt(10_000)
    simulation = { attempted: true, ok: true, amountOut: sim.amountOut.toString() }
  }

  const tx = buildTransaction(action, input, amountOutMinimum)

  if (action !== 'swap') {
    const sim = await simulateGeneric(action, input, tx)
    if (sim.attempted && !sim.ok) {
      const failed: GuardDecision = {
        ...decision,
        allowed: false,
        reason: GUARD_REASONS.SIMULATION_REVERTED,
        message: GUARD_REASON_COPY[GUARD_REASONS.SIMULATION_REVERTED],
        checks: [...decision.checks, { id: 'simulation', label: 'On-chain simulation', status: 'failed', detail: sim.detail }],
      }
      await recordRejection(failed, input)
      return denial(failed)
    }
    simulation = { attempted: sim.attempted, ok: sim.ok, detail: sim.detail }
  }

  const checks: GuardCheck[] = [
    ...decision.checks,
    { id: 'simulation', label: 'On-chain simulation', status: simulation?.ok ? 'passed' : 'not_evaluated', detail: simulation?.ok ? (simulation.amountOut ? `expected output ${simulation.amountOut}` : 'call succeeded') : simulation?.detail },
  ]

  // Commit the authorization atomically, re-checking the cap to close the race
  // between two concurrent requests against the same session.
  const sessionId = decision.metadata.sessionId as string
  const consumes = ACTION_CONSUMES_CAP[action]
  const committedAmount = consumes ? new Decimal(amount || 0) : new Decimal(0)

  try {
    const executionId = await prisma.$transaction(async (tx2) => {
      if (consumes && committedAmount.greaterThan(0)) {
        const session = await tx2.agentSession.findUnique({ where: { id: sessionId }, select: { spendingLimit: true, status: true, expiresAt: true } })
        if (!session || session.status !== 'Active' || session.expiresAt.getTime() <= Date.now()) throw new Error('SESSION_NO_LONGER_VALID')
        if (session.spendingLimit === null) throw new Error('SPENDING_CAP_UNSET')
        const agg = await tx2.guardExecution.aggregate({
          where: { sessionId, asset, status: { in: ['AUTHORIZED', 'SUBMITTED', 'CONFIRMED'] }, decision: 'APPROVED' },
          _sum: { amount: true },
        })
        const spent = agg._sum.amount ?? new Decimal(0)
        if (spent.plus(committedAmount).greaterThan(new Decimal(session.spendingLimit.toString()))) throw new Error('SPENDING_CAP_EXCEEDED')
      }
      const created = await tx2.guardExecution.create({
        data: {
          id: `gx_${randomUUID()}`,
          sessionId,
          agentId: decision.metadata.agentId as string,
          walletAddress: normalizeAddress(input.wallet),
          action,
          chainId: Number(input.chainId),
          toAddress: normalizeAddress(tx.to),
          method: tx.method,
          asset,
          amount: committedAmount,
          valueWei: tx.value,
          decision: 'APPROVED',
          reason: GUARD_REASONS.APPROVED,
          status: 'AUTHORIZED',
          txDataHash: tx.txDataHash,
          checks: checks as unknown as Prisma.InputJsonValue,
          metadata: {
            ...decision.metadata,
            requestedAmount: amount,
            summary: tx.summary,
            simulation: simulation ? { ...simulation } : null,
            amountOutMinimum: amountOutMinimum.toString(),
          } as unknown as Prisma.InputJsonValue,
          reservationExpiresAt: new Date(Date.now() + RESERVATION_WINDOW_MS),
        },
        select: { id: true },
      })
      return created.id
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    await prisma.agentAuditLog.create({
      data: {
        id: randomUUID(),
        sessionId,
        action: 'GUARD_AUTHORIZED',
        actorAddress: normalizeAddress(input.wallet),
        details: { executionId, guardAction: action, asset, amount, txDataHash: tx.txDataHash } as unknown as Prisma.InputJsonValue,
      },
    }).catch(() => undefined)

    return { decision: { ...decision, checks }, executionId, transaction: tx, simulation }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'GUARD_UNAVAILABLE'
    const reason = message === 'SPENDING_CAP_EXCEEDED' ? GUARD_REASONS.SPENDING_CAP_EXCEEDED
      : message === 'SPENDING_CAP_UNSET' ? GUARD_REASONS.SPENDING_CAP_UNSET
      : message === 'SESSION_NO_LONGER_VALID' ? GUARD_REASONS.SESSION_INACTIVE
      : GUARD_REASONS.GUARD_UNAVAILABLE
    return denial({ ...decision, allowed: false, reason, message: GUARD_REASON_COPY[reason], checks })
  }
}

/** Rejections are recorded too — a denied request is exactly what the audit log is for. */
async function recordRejection(decision: GuardDecision, input: AuthorizeInput) {
  const sessionId = decision.metadata.sessionId
  if (!sessionId || !decision.metadata.agentId) return
  try {
    await prisma.guardExecution.create({
      data: {
        id: `gx_${randomUUID()}`,
        sessionId,
        agentId: decision.metadata.agentId,
        walletAddress: normalizeAddress(input.wallet),
        action: String(input.action),
        chainId: Number(input.chainId) || 0,
        toAddress: decision.metadata.to,
        method: decision.metadata.method,
        asset: decision.metadata.asset,
        amount: new Decimal(0),
        valueWei: '0',
        decision: 'REJECTED',
        reason: decision.reason,
        status: 'REJECTED',
        txDataHash: 'not-prepared',
        checks: decision.checks as unknown as Prisma.InputJsonValue,
        metadata: { ...decision.metadata, requestedAmount: decision.metadata.amount } as unknown as Prisma.InputJsonValue,
      },
    })
    await prisma.agentAuditLog.create({
      data: {
        id: randomUUID(),
        sessionId,
        action: 'GUARD_REJECTED',
        actorAddress: normalizeAddress(input.wallet),
        details: { reason: decision.reason, guardAction: input.action } as unknown as Prisma.InputJsonValue,
      },
    })
  } catch {
    // A rejection that cannot be logged must still be a rejection.
  }
}

/* ------------------------------------------------------------------ receipts */

export async function recordSubmission(executionId: string, wallet: string, txHash: string) {
  const execution = await prisma.guardExecution.findUnique({ where: { id: executionId } })
  if (!execution) throw new Error('EXECUTION_NOT_FOUND')
  if (normalizeAddress(execution.walletAddress) !== normalizeAddress(wallet)) throw new Error('WRONG_WALLET')
  if (execution.decision !== 'APPROVED') throw new Error('EXECUTION_NOT_AUTHORIZED')
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) throw new Error('INVALID_TX_HASH')
  return prisma.guardExecution.update({
    where: { id: executionId },
    data: { status: 'SUBMITTED', txHash, submittedAt: new Date(), reservationExpiresAt: null },
  })
}

export async function recordConfirmation(executionId: string, wallet: string, receipt: {
  success: boolean
  blockNumber?: string | null
  gasUsed?: string | null
  effectiveGasPrice?: string | null
  error?: string | null
}) {
  const execution = await prisma.guardExecution.findUnique({ where: { id: executionId } })
  if (!execution) throw new Error('EXECUTION_NOT_FOUND')
  if (normalizeAddress(execution.walletAddress) !== normalizeAddress(wallet)) throw new Error('WRONG_WALLET')
  return prisma.guardExecution.update({
    where: { id: executionId },
    data: {
      status: receipt.success ? 'CONFIRMED' : 'FAILED',
      confirmedAt: receipt.success ? new Date() : null,
      blockNumber: receipt.blockNumber ? BigInt(receipt.blockNumber) : null,
      gasUsed: receipt.gasUsed ? BigInt(receipt.gasUsed) : null,
      effectiveGasPrice: receipt.effectiveGasPrice ? BigInt(receipt.effectiveGasPrice) : null,
      // A reverted transaction returns its headroom to the session.
      amount: receipt.success ? execution.amount : new Decimal(0),
      error: receipt.error ?? null,
    },
  })
}

export async function cancelAuthorization(executionId: string, wallet: string) {
  const execution = await prisma.guardExecution.findUnique({ where: { id: executionId } })
  if (!execution) throw new Error('EXECUTION_NOT_FOUND')
  if (normalizeAddress(execution.walletAddress) !== normalizeAddress(wallet)) throw new Error('WRONG_WALLET')
  if (execution.status !== 'AUTHORIZED') return execution
  return prisma.guardExecution.update({ where: { id: executionId }, data: { status: 'CANCELLED', amount: new Decimal(0), error: 'USER_CANCELLED' } })
}

export async function listExecutions(wallet: string, limit = 30) {
  await expireStaleReservations()
  return prisma.guardExecution.findMany({
    where: { walletAddress: normalizeAddress(wallet) },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 100),
    include: { agent: { select: { id: true, name: true } } },
  })
}

export async function sessionSpendSummary(sessionId: string, asset: string) {
  await expireStaleReservations(sessionId)
  const spent = await spentForSession(sessionId, asset)
  return { asset, spent: spent.toString() }
}

export { formatUnits }
