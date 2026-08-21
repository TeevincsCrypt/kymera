import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createGuardSession } from '@/lib/guard/sessions'
import { BLOCKED_PERMISSIONS, GUARD_PERMISSIONS, normalizeAddress } from '@/lib/guard/policy'
import { getPaymentProvider } from '@/lib/payments'

export class HireInputError extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'HireInputError'
  }
}

/** Permissions a hire may request without a separate, explicit Guard grant. */
const HIRE_GRANTABLE_PERMISSIONS = GUARD_PERMISSIONS.filter(
  (permission) => !(BLOCKED_PERMISSIONS as readonly string[]).includes(permission) && permission !== 'submit_transactions',
)

/**
 * Hiring an agent never sets a spending limit. A limit is a separate, deliberate
 * decision the user makes when granting a Guard session, and conflating it with the
 * hire price (a USD figure) would silently authorize on-chain value in a different
 * unit entirely. Sessions created here start with no cap, which means Guard refuses
 * every value-bearing action until the user sets one explicitly.
 */
const HIRE_SESSION_HOURS = 24

export async function createHire(input: {
  agentId: string
  userAddress: string
  task: string
  amount?: number
  requestedPermissions?: string[]
  benchmarkId?: string
}) {
  if (!input.agentId || !input.userAddress || !input.task?.trim()) {
    throw new HireInputError('Agent, wallet, and task are required', 'MISSING_FIELDS')
  }
  const task = input.task.trim()
  if (task.length > 2000) throw new HireInputError('Task description is too long', 'TASK_TOO_LONG')

  const agent = await prisma.agent.findUnique({ where: { id: input.agentId } })
  if (!agent) throw new HireInputError('Agent not found', 'AGENT_NOT_FOUND')

  const amount = Number(input.amount ?? agent.price ?? 0)
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) throw new HireInputError('Invalid hire amount', 'INVALID_AMOUNT')

  const requested = [...new Set(input.requestedPermissions ?? ['read_market_data', 'analyze_positions'])]
  const rejected = requested.filter((permission) => !(HIRE_GRANTABLE_PERMISSIONS as readonly string[]).includes(permission))
  const permissions = requested.filter((permission) => (HIRE_GRANTABLE_PERMISSIONS as readonly string[]).includes(permission))

  const provider = getPaymentProvider()
  const userAddress = normalizeAddress(input.userAddress)

  const hire = await prisma.agentHire.create({
    data: {
      id: randomUUID(),
      agentId: agent.id,
      userAddress,
      status: amount > 0 ? 'PENDING_PAYMENT' : 'PENDING_ACTIVATION',
      paymentProvider: provider.id,
      amount,
      task,
      benchmarkId: input.benchmarkId,
      requestedPermissions: permissions as unknown as Prisma.InputJsonValue,
      blockedActions: rejected as unknown as Prisma.InputJsonValue,
    },
  })

  const intent = await provider.createIntent({ amount, currency: 'USD', reference: hire.id })
  const updated = await prisma.agentHire.update({
    where: { id: hire.id },
    data: { paymentId: intent.id, paymentStatus: intent.status },
    include: { agent: { select: { id: true, name: true } } },
  })

  return {
    hire: updated,
    payment: { mode: intent.mode, status: intent.status, disclosure: intent.disclosure, provider: provider.label },
    /** Permissions the hire asked for that Kymera refuses to grant this way. */
    rejectedPermissions: rejected,
  }
}

/**
 * Settles a hire and activates it. On activation a Guard session is created with the
 * agreed read-only permissions and NO spending limit — the user must grant execution
 * permissions and a cap separately and deliberately.
 */
export async function settleHire(hireId: string, userAddress: string) {
  const wallet = normalizeAddress(userAddress)
  const hire = await prisma.agentHire.findFirst({ where: { id: hireId, userAddress: wallet }, include: { agent: { select: { id: true, name: true } } } })
  if (!hire) throw new HireInputError('Hire not found', 'HIRE_NOT_FOUND')
  if (hire.status === 'ACTIVE') {
    return { hire, payment: { mode: 'demo' as const, status: hire.paymentStatus, disclosure: 'Already active.' }, sessionId: hire.sessionId }
  }
  if (!hire.paymentId) throw new HireInputError('This hire has no payment intent', 'NO_PAYMENT_INTENT')

  const provider = getPaymentProvider()
  const result = await provider.settle({ paymentId: hire.paymentId, reference: hire.id })

  if (!result.settled) {
    const failed = await prisma.agentHire.update({
      where: { id: hire.id },
      data: { paymentStatus: result.status, status: 'PAYMENT_FAILED' },
      include: { agent: { select: { id: true, name: true } } },
    })
    return { hire: failed, payment: { mode: result.mode, status: result.status, disclosure: result.disclosure }, sessionId: null }
  }

  const permissions = Array.isArray(hire.requestedPermissions) ? (hire.requestedPermissions as string[]) : []
  const session = hire.sessionId
    ? null
    : await createGuardSession({
        agentId: hire.agentId,
        userAddress: wallet,
        durationHours: HIRE_SESSION_HOURS,
        // Intentionally omitted: no spending limit is granted by hiring.
        spendingLimit: undefined,
        permissions,
      })

  const activated = await prisma.agentHire.update({
    where: { id: hire.id },
    data: {
      paymentStatus: result.status,
      status: 'ACTIVE',
      paidAt: new Date(),
      activatedAt: new Date(),
      sessionId: session?.id ?? hire.sessionId,
    },
    include: { agent: { select: { id: true, name: true } } },
  })

  return {
    hire: activated,
    payment: { mode: result.mode, status: result.status, disclosure: result.disclosure },
    sessionId: activated.sessionId,
  }
}

export async function listHires(userAddress: string) {
  return prisma.agentHire.findMany({
    where: { userAddress: { equals: normalizeAddress(userAddress), mode: 'insensitive' } },
    include: { agent: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getHire(id: string, userAddress: string) {
  return prisma.agentHire.findFirst({
    where: { id, userAddress: { equals: normalizeAddress(userAddress), mode: 'insensitive' } },
    include: { agent: { select: { id: true, name: true } } },
  })
}
