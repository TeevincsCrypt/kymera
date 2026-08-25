/**
 * The Guard → Altana → chain execution path.
 *
 * Order matters and is not negotiable:
 *
 *   1. Kymera Guard evaluates the request and, only if it allows it, builds the exact
 *      calldata and reserves spending headroom in the ledger.
 *   2. The Altana session key submits that calldata — nothing else — through the agent
 *      wallet. The account contract re-checks the same allowlist and spend cap on-chain.
 *   3. The result is written back to the same GuardExecution row.
 *
 * Guard is the policy engine. Altana is enforcement and settlement. A request Guard
 * denies never reaches step 2, because no transaction object is ever produced.
 *
 * Funds at risk are only those held by the agent wallet: swap proceeds are sent to the
 * user's own wallet, and the user's wallet is never a signer on this path.
 */

import { Prisma } from '@prisma/client'
import type { Address, Hex } from 'viem'
import { prisma } from '@/lib/prisma'
import { authorizeAction, recordSubmission, type AuthorizeInput, type AuthorizeResult } from '@/lib/guard/execute'
import { normalizeAddress } from '@/lib/guard/policy'
import { altanaFor, describe } from './client'
import { resumeAltanaSession, type AltanaSessionRow } from './session'

/** How an execution reached the chain. Recorded so the activity log never mixes states. */
export const EXECUTION_MODE = {
  /** Signed by the user's own wallet in the browser. */
  userWallet: 'USER_WALLET',
  /** Submitted autonomously by an Altana session key from the agent wallet. */
  altanaSession: 'ALTANA_SESSION',
  /** Guard refused. Nothing was built and nothing was sent. */
  blocked: 'BLOCKED',
} as const

export type AltanaExecution =
  | { ok: true; executionId: string; txHash?: Hex; callsId: Hex; status: 'PENDING' | 'CONFIRMED' | 'FAILED'; explorerUrl?: string; decision: AuthorizeResult['decision'] }
  | { ok: false; stage: 'guard'; decision: AuthorizeResult['decision'] }
  | { ok: false; stage: 'altana'; reason: string; detail?: string; executionId: string | null; decision: AuthorizeResult['decision'] }

/**
 * Run an action end to end through an Altana session.
 *
 * `sessionRow` must be the same Guard session named in `input.sessionId` — the caller is
 * responsible for loading it under the authenticated user, and Guard independently
 * re-checks ownership, status, and expiry before allowing anything.
 */
export async function executeThroughAltana(
  input: AuthorizeInput,
  sessionRow: AltanaSessionRow,
  permissions: readonly string[],
): Promise<AltanaExecution> {
  const authorized = await authorizeAction(input)
  if (!authorized.decision.allowed || !authorized.transaction) {
    return { ok: false, stage: 'guard', decision: authorized.decision }
  }

  const executionId = authorized.executionId
  const transaction = authorized.transaction

  const resolved = altanaFor(transaction.chainId)
  if (!resolved.ok) {
    await failExecution(executionId, resolved.reason)
    return { ok: false, stage: 'altana', reason: resolved.reason, executionId, decision: authorized.decision }
  }

  const session = resumeAltanaSession(sessionRow, permissions)
  if (!session) {
    await failExecution(executionId, 'ALTANA_SESSION_NOT_GRANTED')
    return { ok: false, stage: 'altana', reason: 'ALTANA_SESSION_NOT_GRANTED', executionId, decision: authorized.decision }
  }

  try {
    const result = await resolved.client.execute({
      session,
      chainId: transaction.chainId,
      // Exactly what Guard built, byte for byte. Nothing here can alter it.
      calls: [{ to: transaction.to as Address, data: transaction.data as Hex, value: BigInt(transaction.value) }],
    })

    if (executionId) {
      if (result.transactionHash) {
        await recordSubmission(executionId, input.wallet, result.transactionHash).catch(() => undefined)
      }
      await prisma.guardExecution.update({
        where: { id: executionId },
        data: {
          status: result.status === 'CONFIRMED' ? 'CONFIRMED' : result.status === 'FAILED' ? 'FAILED' : 'SUBMITTED',
          confirmedAt: result.status === 'CONFIRMED' ? new Date() : null,
          reservationExpiresAt: null,
          metadata: await mergeMetadata(executionId, {
            executionMode: EXECUTION_MODE.altanaSession,
            altanaCallsId: result.callsId,
            altanaWallet: session.walletAddress,
            altanaSessionKey: session.publicKey,
          }),
        },
      }).catch(() => undefined)
    }

    return {
      ok: true,
      executionId: executionId as string,
      txHash: result.transactionHash,
      callsId: result.callsId,
      status: result.status,
      explorerUrl: result.transactionHash ? `${resolved.network.explorer}/tx/${result.transactionHash}` : undefined,
      decision: authorized.decision,
    }
  } catch (error) {
    const detail = describe(error)
    await failExecution(executionId, 'ALTANA_RELAY_UNREACHABLE', detail)
    return { ok: false, stage: 'altana', reason: 'ALTANA_RELAY_UNREACHABLE', detail, executionId, decision: authorized.decision }
  }
}

/**
 * Release the authorization when the submission never happened. The amount is zeroed so
 * the reservation returns to the session's spending cap rather than being consumed by a
 * transaction that was never sent.
 */
async function failExecution(executionId: string | null, reason: string, detail?: string) {
  if (!executionId) return
  await prisma.guardExecution.update({
    where: { id: executionId },
    data: {
      status: 'FAILED',
      error: detail ? `${reason}: ${detail}` : reason,
      amount: new Prisma.Decimal(0),
      reservationExpiresAt: null,
      metadata: await mergeMetadata(executionId, { executionMode: EXECUTION_MODE.altanaSession, altanaFailure: reason }),
    },
  }).catch(() => undefined)
}

async function mergeMetadata(executionId: string, extra: Record<string, unknown>) {
  const existing = await prisma.guardExecution.findUnique({ where: { id: executionId }, select: { metadata: true } })
  const base = (existing?.metadata as Record<string, unknown> | null) ?? {}
  return { ...base, ...extra } as unknown as Prisma.InputJsonValue
}

/** True when this wallet address is the Altana agent wallet for a chain. */
export function isAltanaWallet(chainId: number, address: string) {
  const resolved = altanaFor(chainId)
  return resolved.ok && normalizeAddress(resolved.walletAddress) === normalizeAddress(address)
}
