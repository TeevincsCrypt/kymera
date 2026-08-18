import { prisma } from '@/lib/prisma'
import { execute as executeAltana, getAltanaStatus } from '@/lib/altana/provider'
import { type AltanaAction, type AltanaSession } from '@/lib/altana/domain'

export type ExecutionInput = { agentId?: string; sessionId?: string; userAddress: string; action: AltanaAction }

export async function executeKymera(input: ExecutionInput) {
  const action = input.action
  const agent = input.agentId ? await prisma.agent.findUnique({ where: { id: input.agentId }, include: { performance: true } }) : await prisma.agent.findFirst({ include: { performance: true } })
  if (!agent) throw new Error('AGENT_NOT_FOUND')
  const session = input.sessionId ? await prisma.agentSession.findFirst({ where: { id: input.sessionId, userAddress: input.userAddress }, include: { permissions: true } }) : await prisma.agentSession.findFirst({ where: { agentId: agent.id, userAddress: input.userAddress, status: 'Active' }, include: { permissions: true }, orderBy: { createdAt: 'desc' } })
  const activeSession = session
  if (!activeSession) throw new Error('GUARD_SESSION_NOT_FOUND')
  const simulatedSession: AltanaSession = { id: activeSession.id, wallet: activeSession.userAddress, agentId: activeSession.agentId, allowedContracts: ['0xPancakeRouter'], allowedMethods: activeSession.permissions.filter((p) => p.allowed).map((p) => p.permission), spendingCap: Number(activeSession.spendingLimit), expiry: activeSession.expiresAt.toISOString(), status: activeSession.status === 'Active' ? 'active' : activeSession.status === 'Expired' ? 'expired' : 'revoked', simulated: false }
  const decision = await executeAltana(simulatedSession, action)
  const score = agent.performance?.kymeraScore ?? 0
  const status = decision.approved ? 'AUTHORIZED' : 'REJECTED'
  const wallet = await prisma.altanaWallet.upsert({ where: { address: activeSession.userAddress }, update: {}, create: { address: activeSession.userAddress, network: getAltanaStatus().network, mode: 'testnet' } })
  const altanaSession = await prisma.altanaSession.upsert({ where: { id: activeSession.id }, update: { status: simulatedSession.status, expiry: activeSession.expiresAt, simulated: simulatedSession.simulated }, create: { id: activeSession.id, walletId: wallet.id, agentId: agent.id, allowedContracts: simulatedSession.allowedContracts, allowedMethods: simulatedSession.allowedMethods, spendingCap: simulatedSession.spendingCap, expiry: activeSession.expiresAt, status: simulatedSession.status, simulated: simulatedSession.simulated } })
  const receipt = await prisma.altanaExecution.create({ data: { id: `exec_${crypto.randomUUID()}`, agentId: agent.id, walletId: wallet.id, sessionId: altanaSession.id, action: action.action, target: action.target, value: action.value, status, simulated: Boolean(decision.simulated), rejectionReason: decision.approved ? null : decision.reason } })
  return { receiptId: receipt.id, status, simulated: Boolean(decision.simulated), score, pipeline: ['AGENT_RESOLVED', 'KYМERA_SCORE_READ', 'GUARD_EVALUATED', 'ALTANA_SESSION_CHECKED', 'EXECUTION_RECORDED'], decision, action, altana: getAltanaStatus() }
}

export async function listExecutions(userAddress: string) { const wallet = await prisma.altanaWallet.findUnique({ where: { address: userAddress }, select: { id: true } }); return wallet ? prisma.altanaExecution.findMany({ where: { walletId: wallet.id }, orderBy: { createdAt: 'desc' }, take: 30 }) : [] }
