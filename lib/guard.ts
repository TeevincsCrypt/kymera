import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getAltanaStatus, grantAltanaSession } from '@/lib/altana/provider'

export const GUARD_PERMISSIONS = ['read_market_data', 'analyze_positions', 'execute_trades', 'move_funds', 'submit_transactions'] as const
export type GuardPermission = (typeof GUARD_PERMISSIONS)[number]

const dangerous = new Set<GuardPermission>(['move_funds'])

export type CreateGuardInput = {
  agentId: string
  userAddress: string
  spendingLimit?: number
  durationHours: number
  permissions: string[]
}

export function validateGuardInput(input: CreateGuardInput) {
  const permissions = [...new Set(input.permissions)]
  if (!input.agentId || !input.userAddress) throw new Error('Agent and wallet address are required')
  if (!Number.isFinite(input.durationHours) || input.durationHours < 1 || input.durationHours > 720) throw new Error('Duration must be between 1 and 720 hours')
  if (input.spendingLimit !== undefined && (!Number.isFinite(input.spendingLimit) || input.spendingLimit < 0 || input.spendingLimit > 1_000_000)) throw new Error('Spending limit must be between 0 and 1,000,000')
  if (permissions.some((permission) => !GUARD_PERMISSIONS.includes(permission as GuardPermission))) throw new Error('Unsupported permission requested')
  if (permissions.includes('move_funds')) throw new Error('MOVE_FUNDS_REQUIRES_EXPLICIT_WALLET_FLOW')
  return { ...input, permissions: permissions as GuardPermission[] }
}

export async function createGuardSession(input: CreateGuardInput) {
  const valid = validateGuardInput(input)
  const expiresAt = new Date(Date.now() + valid.durationHours * 60 * 60 * 1000)
  const altana = getAltanaStatus()
  let grant: Awaited<ReturnType<typeof grantAltanaSession>> | null = null
  if (altana.configured) grant = await grantAltanaSession({ expiry: expiresAt, spendLimit: valid.spendingLimit, permissions: valid.permissions })
  const session = await prisma.agentSession.create({ data: { id: randomUUID(), agentId: valid.agentId, userAddress: valid.userAddress, spendingLimit: valid.spendingLimit, expiresAt, status: 'Active', mode: grant ? 'ALTANA_ONCHAIN' : 'SIMULATION', provider: grant ? 'ALTANA' : 'KYМERA_GUARD', walletAddress: grant?.walletAddress, providerSessionId: grant?.providerSessionId, network: grant?.network, verificationUrl: grant?.verificationUrl, grantTxHash: grant?.transactionHash, permissions: { create: valid.permissions.map((permission) => ({ permission, allowed: true })) } } })
  await prisma.agentAuditLog.create({ data: { id: randomUUID(), sessionId: session.id, action: 'SESSION_CREATED', actorAddress: valid.userAddress, details: { permissions: valid.permissions, durationHours: valid.durationHours, spendingLimit: valid.spendingLimit, mode: grant ? 'ALTANA_ONCHAIN' : 'SIMULATION', provider: grant ? 'ALTANA' : 'KYМERA_GUARD' } } })
  return session
}

export async function revokeGuardSession(id: string, actorAddress: string) {
  const session = await prisma.agentSession.update({ where: { id }, data: { status: 'Revoked', revokedAt: new Date() } })
  await prisma.agentAuditLog.create({ data: { id: randomUUID(), sessionId: id, action: 'SESSION_REVOKED', actorAddress, details: { mode: 'SIMULATION' } } })
  return session
}

export async function listGuardSessions(userAddress?: string) {
  const sessions = await prisma.agentSession.findMany({ where: userAddress ? { userAddress } : undefined, orderBy: { createdAt: 'desc' }, include: { agent: true, auditLogs: { orderBy: { createdAt: 'desc' }, take: 20 } } })
  const now = Date.now()
  return sessions.map((session) => session.status === 'Active' && session.expiresAt.getTime() <= now ? { ...session, status: 'Expired' } : session)
}

export async function getGuardSession(id: string) {
  return prisma.agentSession.findUnique({ where: { id }, include: { agent: true, auditLogs: { orderBy: { createdAt: 'desc' }, take: 50 } } })
}
