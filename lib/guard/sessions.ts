/** Guard session lifecycle: grant, list, inspect, revoke. */

import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  BLOCKED_PERMISSIONS,
  BSC_TESTNET_CHAIN_ID,
  GUARD_PERMISSIONS,
  allowedChainIds,
  normalizeAddress,
  type GuardPermission,
} from './policy'
import { expireStaleReservations, spentForSession } from './evaluate'

export type CreateGuardInput = {
  agentId: string
  userAddress: string
  spendingLimit?: number
  durationHours: number
  permissions: string[]
  chainId?: number
}

export class GuardInputError extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'GuardInputError'
  }
}

export function validateGuardInput(input: CreateGuardInput) {
  const permissions = [...new Set(input.permissions)]
  if (!input.agentId || !input.userAddress) throw new GuardInputError('Agent and wallet address are required', 'AGENT_AND_WALLET_REQUIRED')
  if (!Number.isFinite(input.durationHours) || input.durationHours < 1 || input.durationHours > 720) {
    throw new GuardInputError('Duration must be between 1 and 720 hours', 'INVALID_DURATION')
  }
  if (input.spendingLimit !== undefined && (!Number.isFinite(input.spendingLimit) || input.spendingLimit < 0 || input.spendingLimit > 1_000_000)) {
    throw new GuardInputError('Spending limit must be between 0 and 1,000,000', 'INVALID_SPENDING_LIMIT')
  }
  const unsupported = permissions.filter((permission) => !(GUARD_PERMISSIONS as readonly string[]).includes(permission))
  if (unsupported.length) throw new GuardInputError(`Unsupported permission requested: ${unsupported.join(', ')}`, 'UNSUPPORTED_PERMISSION')
  const blocked = permissions.filter((permission) => (BLOCKED_PERMISSIONS as readonly string[]).includes(permission))
  if (blocked.length) throw new GuardInputError(`${blocked.join(', ')} cannot be granted through a Guard session`, 'PERMISSION_BLOCKED')

  const chainId = input.chainId ?? BSC_TESTNET_CHAIN_ID
  if (!allowedChainIds().includes(chainId)) throw new GuardInputError('Execution is not enabled on that network', 'CHAIN_NOT_ALLOWED')

  return { ...input, chainId, permissions: permissions as GuardPermission[] }
}

export async function createGuardSession(input: CreateGuardInput) {
  const valid = validateGuardInput(input)
  const agent = await prisma.agent.findUnique({ where: { id: valid.agentId }, select: { id: true } })
  if (!agent) throw new GuardInputError('Agent not found', 'AGENT_NOT_FOUND')

  const expiresAt = new Date(Date.now() + valid.durationHours * 60 * 60 * 1000)
  const userAddress = normalizeAddress(valid.userAddress)

  return prisma.$transaction(async (tx) => {
    const session = await tx.agentSession.create({
      data: {
        id: randomUUID(),
        agentId: valid.agentId,
        userAddress,
        walletAddress: userAddress,
        spendingLimit: valid.spendingLimit,
        expiresAt,
        status: 'Active',
        mode: 'GUARDED',
        provider: 'KYMERA_GUARD',
        chainId: valid.chainId,
        network: valid.chainId === BSC_TESTNET_CHAIN_ID ? 'BNB Smart Chain Testnet' : 'BNB Smart Chain',
        permissions: { create: valid.permissions.map((permission) => ({ permission, allowed: true })) },
      },
      include: { permissions: true, agent: { select: { id: true, name: true } } },
    })
    await tx.agentAuditLog.create({
      data: {
        id: randomUUID(),
        sessionId: session.id,
        action: 'SESSION_CREATED',
        actorAddress: userAddress,
        details: {
          permissions: valid.permissions,
          durationHours: valid.durationHours,
          spendingLimit: valid.spendingLimit ?? null,
          chainId: valid.chainId,
        } as unknown as Prisma.InputJsonValue,
      },
    })
    return session
  })
}

/**
 * Revoke a session. `actorAddress` is the authenticated wallet and MUST own the
 * session — this is what stops one wallet revoking another's authorization.
 */
export async function revokeGuardSession(id: string, actorAddress: string) {
  const actor = normalizeAddress(actorAddress)
  const session = await prisma.agentSession.findUnique({ where: { id }, select: { id: true, userAddress: true, status: true } })
  if (!session) throw new GuardInputError('Session not found', 'SESSION_NOT_FOUND')
  if (normalizeAddress(session.userAddress) !== actor) throw new GuardInputError('This session belongs to a different wallet', 'WRONG_WALLET')

  return prisma.$transaction(async (tx) => {
    const updated = await tx.agentSession.update({ where: { id }, data: { status: 'Revoked', revokedAt: new Date() } })
    // Outstanding authorizations die with the session.
    await tx.guardExecution.updateMany({
      where: { sessionId: id, status: 'AUTHORIZED' },
      data: { status: 'CANCELLED', error: 'SESSION_REVOKED' },
    })
    await tx.agentAuditLog.create({
      data: { id: randomUUID(), sessionId: id, action: 'SESSION_REVOKED', actorAddress: actor, details: {} as unknown as Prisma.InputJsonValue },
    })
    return updated
  })
}

function withDerivedStatus<T extends { status: string; expiresAt: Date }>(session: T) {
  return session.status === 'Active' && session.expiresAt.getTime() <= Date.now() ? { ...session, status: 'Expired' } : session
}

export async function listGuardSessions(userAddress: string) {
  await expireStaleReservations()
  const sessions = await prisma.agentSession.findMany({
    where: { userAddress: { equals: normalizeAddress(userAddress), mode: 'insensitive' } },
    orderBy: { createdAt: 'desc' },
    include: {
      agent: { select: { id: true, name: true } },
      permissions: true,
      auditLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  })
  return sessions.map(withDerivedStatus)
}

/** Returns null when the session does not exist OR is not owned by this wallet. */
export async function getGuardSession(id: string, userAddress: string) {
  const session = await prisma.agentSession.findUnique({
    where: { id },
    include: {
      agent: { select: { id: true, name: true } },
      permissions: true,
      auditLogs: { orderBy: { createdAt: 'desc' }, take: 50 },
      executions: { orderBy: { createdAt: 'desc' }, take: 25 },
    },
  })
  if (!session || normalizeAddress(session.userAddress) !== normalizeAddress(userAddress)) return null
  const spent = session.spendingLimit ? await spentForSession(session.id, 'BNB') : null
  return { ...withDerivedStatus(session), nativeSpent: spent ? spent.toString() : null }
}
