import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { createGuardSession } from '@/lib/guard'
import { getPaymentProvider } from '@/lib/payments'

const blockedActions = ['move_funds', 'submit_transactions']

export async function createHire(input: { agentId: string; userAddress: string; task: string; amount?: number; requestedPermissions?: string[]; benchmarkId?: string }) {
  if (!input.agentId || !input.userAddress || !input.task?.trim()) throw new Error('Agent, wallet address, and task are required')
  const agent = await prisma.agent.findUnique({ where: { id: input.agentId } })
  if (!agent) throw new Error('Agent not found')
  const amount = Number(input.amount ?? agent.price ?? 0)
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) throw new Error('Invalid hire amount')
  const permissions = [...new Set(input.requestedPermissions ?? ['read_market_data', 'analyze_positions'])].filter((permission) => !blockedActions.includes(permission))
  const hire = await prisma.agentHire.create({ data: { id: randomUUID(), agentId: agent.id, userAddress: input.userAddress, status: 'PENDING_PAYMENT', paymentProvider: 'mock', amount, task: input.task.trim(), benchmarkId: input.benchmarkId, requestedPermissions: permissions, blockedActions } })
  const payment = await getPaymentProvider().createIntent({ amount, currency: 'USD', reference: hire.id })
  return prisma.agentHire.update({ where: { id: hire.id }, data: { paymentId: payment.id, paymentStatus: payment.status }, include: { agent: true } })
}

export async function verifyHirePayment(hireId: string, userAddress: string) {
  const hire = await prisma.agentHire.findFirst({ where: { id: hireId, userAddress }, include: { agent: true } })
  if (!hire || !hire.paymentId) throw new Error('Hire or payment not found')
  const result = await getPaymentProvider().verifyPayment(hire.paymentId)
  if (!result.verified) return prisma.agentHire.update({ where: { id: hire.id }, data: { paymentStatus: result.status, status: 'PAYMENT_FAILED' }, include: { agent: true } })
  const session = hire.sessionId ? null : await createGuardSession({ agentId: hire.agentId, userAddress, durationHours: 24, spendingLimit: Number(hire.amount), permissions: Array.isArray(hire.requestedPermissions) ? hire.requestedPermissions as string[] : [] })
  return prisma.agentHire.update({ where: { id: hire.id }, data: { paymentStatus: 'VERIFIED', status: 'ACTIVE', paymentId: hire.paymentId, paidAt: new Date(), activatedAt: new Date(), sessionId: session?.id ?? hire.sessionId }, include: { agent: true } })
}

export async function listHires(userAddress: string) {
  return prisma.agentHire.findMany({ where: { userAddress }, include: { agent: true }, orderBy: { createdAt: 'desc' } })
}

export async function getHire(id: string, userAddress: string) {
  return prisma.agentHire.findFirst({ where: { id, userAddress }, include: { agent: true } })
}
