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

/**
 * Pause a session without ending it. Guard treats anything that is not `Active` as
 * inactive, so a paused session refuses every request exactly as a revoked one does.
 *
 * Outstanding authorizations are cancelled as well. A pause that left already-approved
 * transactions signable would be a pause in name only.
 */
export async function pauseGuardSession(id: string, actorAddress: string, paused: boolean) {
  const actor = normalizeAddress(actorAddress)
  const session = await prisma.agentSession.findUnique({ where: { id }, select: { id: true, userAddress: true, status: true, expiresAt: true } })
  if (!session) throw new GuardInputError('Session not found', 'SESSION_NOT_FOUND')
  if (normalizeAddress(session.userAddress) !== actor) throw new GuardInputError('This session belongs to a different wallet', 'WRONG_WALLET')
  if (session.status === 'Revoked') throw new GuardInputError('This session was revoked and cannot be resumed', 'SESSION_REVOKED')
  if (!paused && session.expiresAt.getTime() <= Date.now()) throw new GuardInputError('This session has expired and cannot be resumed', 'SESSION_EXPIRED')

  return prisma.$transaction(async (tx) => {
    const updated = await tx.agentSession.update({ where: { id }, data: { status: paused ? 'Paused' : 'Active' } })
    if (paused) {
      await tx.guardExecution.updateMany({
        where: { sessionId: id, status: 'AUTHORIZED' },
        data: { status: 'CANCELLED', error: 'SESSION_PAUSED' },
      })
    }
    await tx.agentAuditLog.create({
      data: {
        id: randomUUID(),
        sessionId: id,
        action: paused ? 'SESSION_PAUSED' : 'SESSION_RESUMED',
        actorAddress: actor,
        details: {} as unknown as Prisma.InputJsonValue,
      },
    })
    return updated
  })
}

/**
 * Narrow a live session: drop permissions, or lower the spending cap.
 *
 * Widening is deliberately impossible. A delegation the user already granted — and, for
 * an Altana session, already signed on-chain — cannot be quietly given more authority
 * from a web form; that would make the on-chain grant a lie about what the key can do.
 * To grant more, revoke and grant a new session.
 */
export async function narrowGuardSession(
  id: string,
  actorAddress: string,
  input: { permissions?: string[]; spendingLimit?: number | null },
) {
  const actor = normalizeAddress(actorAddress)
  const session = await prisma.agentSession.findUnique({ where: { id }, include: { permissions: true } })
  if (!session) throw new GuardInputError('Session not found', 'SESSION_NOT_FOUND')
  if (normalizeAddress(session.userAddress) !== actor) throw new GuardInputError('This session belongs to a different wallet', 'WRONG_WALLET')
  if (session.status === 'Revoked') throw new GuardInputError('This session was revoked', 'SESSION_REVOKED')

  const current = new Set(session.permissions.filter((entry) => entry.allowed).map((entry) => entry.permission))
  const data: Prisma.AgentSessionUpdateInput = {}
  let removed: string[] = []

  if (input.permissions) {
    const requested = new Set(input.permissions)
    const added = [...requested].filter((permission) => !current.has(permission))
    if (added.length) throw new GuardInputError(`Permissions can only be removed here. Revoke and grant a new session to add ${added.join(', ')}.`, 'PERMISSION_WIDENING_BLOCKED')
    removed = [...current].filter((permission) => !requested.has(permission))
  }

  if (input.spendingLimit !== undefined) {
    const currentLimit = session.spendingLimit === null ? null : Number(session.spendingLimit)
    if (input.spendingLimit === null) {
      // Removing the limit entirely refuses every value-bearing action — a narrowing.
      data.spendingLimit = null
    } else {
      if (!Number.isFinite(input.spendingLimit) || input.spendingLimit < 0) throw new GuardInputError('Invalid spending limit', 'INVALID_SPENDING_LIMIT')
      if (currentLimit !== null && input.spendingLimit > currentLimit) {
        throw new GuardInputError('A spending limit can only be lowered here. Revoke and grant a new session to raise it.', 'LIMIT_WIDENING_BLOCKED')
      }
      if (currentLimit === null) throw new GuardInputError('This session has no spending limit to lower. Revoke and grant a new session to set one.', 'LIMIT_WIDENING_BLOCKED')
      data.spendingLimit = new Prisma.Decimal(input.spendingLimit)
    }
  }

  return prisma.$transaction(async (tx) => {
    if (removed.length) {
      await tx.agentPermission.updateMany({ where: { sessionId: id, permission: { in: removed } }, data: { allowed: false } })
    }
    const updated = await tx.agentSession.update({ where: { id }, data, include: { permissions: true } })
    await tx.agentAuditLog.create({
      data: {
        id: randomUUID(),
        sessionId: id,
        action: 'SESSION_NARROWED',
        actorAddress: actor,
        details: { removedPermissions: removed, spendingLimit: input.spendingLimit ?? null } as unknown as Prisma.InputJsonValue,
      },
    })
    return updated
  })
}
