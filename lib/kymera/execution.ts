import { prisma } from '@/lib/prisma'
import { execute as executeAltana, getAltanaStatus } from '@/lib/altana/provider'
import { createSimulationSession, type AltanaAction, type AltanaSession } from '@/lib/altana/domain'

export const DEMO_ACTIONS = {
  approved: { action: 'swap', target: '0xPancakeRouter', method: 'exactInputSingle', value: 5 },
  unauthorizedContract: { action: 'swap', target: '0xUnknownRouter', method: 'exactInputSingle', value: 5 },
  unauthorizedMethod: { action: 'swap', target: '0xPancakeRouter', method: 'approve', value: 1 },
  spendingLimit: { action: 'swap', target: '0xPancakeRouter', method: 'exactInputSingle', value: 250 },
  expiredSession: { action: 'swap', target: '0xPancakeRouter', method: 'exactInputSingle', value: 5 },
} as const

export type ExecutionInput = { agentId?: string; sessionId?: string; userAddress: string; action: AltanaAction; demo?: keyof typeof DEMO_ACTIONS }

function actionFor(input: ExecutionInput) { return input.demo ? DEMO_ACTIONS[input.demo] : input.action }

export async function executeKymera(input: ExecutionInput) {
  const action = actionFor(input)
  const agent = input.agentId ? await prisma.agent.findUnique({ where: { id: input.agentId }, include: { performance: true } }) : await prisma.agent.findFirst({ include: { performance: true } })
  if (!agent) throw new Error('AGENT_NOT_FOUND')
  const session = input.sessionId ? await prisma.agentSession.findFirst({ where: { id: input.sessionId, userAddress: input.userAddress }, include: { permissions: true } }) : await prisma.agentSession.findFirst({ where: { agentId: agent.id, userAddress: input.userAddress, status: 'Active' }, include: { permissions: true }, orderBy: { createdAt: 'desc' } })
  let activeSession = input.demo ? null : session
  if (!activeSession && input.demo) {
    const expired = input.demo === 'expiredSession'
    activeSession = await prisma.agentSession.create({ data: { id: `demo_${crypto.randomUUID()}`, agentId: agent.id, userAddress: input.userAddress, spendingLimit: 100, expiresAt: new Date(Date.now() + (expired ? -3600000 : 86400000)), status: expired ? 'Expired' : 'Active', mode: 'SIMULATION', permissions: { create: [{ permission: 'exactInputSingle', allowed: true }] } }, include: { permissions: true } })
  }
  if (!activeSession) throw new Error('GUARD_SESSION_NOT_FOUND')
  const simulatedSession: AltanaSession = { id: activeSession.id, wallet: activeSession.userAddress, agentId: activeSession.agentId, allowedContracts: ['0xPancakeRouter'], allowedMethods: activeSession.permissions.filter((p) => p.allowed).map((p) => p.permission), spendingCap: Number(activeSession.spendingLimit), expiry: activeSession.expiresAt.toISOString(), status: activeSession.status === 'Active' ? 'active' : activeSession.status === 'Expired' ? 'expired' : 'revoked', simulated: activeSession.mode !== 'ALTANA_ONCHAIN' }
  const decision = await executeAltana(simulatedSession, action)
  const score = agent.performance?.kymeraScore ?? 0
  const status = decision.approved ? 'SIMULATED_SUCCESS' : 'REJECTED'
  const wallet = await prisma.altanaWallet.upsert({ where: { address: activeSession.userAddress }, update: {}, create: { address: activeSession.userAddress, network: getAltanaStatus().network, mode: simulatedSession.simulated ? 'simulation' : 'testnet' } })
  const altanaSession = await prisma.altanaSession.upsert({ where: { id: activeSession.id }, update: { status: simulatedSession.status, expiry: activeSession.expiresAt, simulated: simulatedSession.simulated }, create: { id: activeSession.id, walletId: wallet.id, agentId: agent.id, allowedContracts: simulatedSession.allowedContracts, allowedMethods: simulatedSession.allowedMethods, spendingCap: simulatedSession.spendingCap, expiry: activeSession.expiresAt, status: simulatedSession.status, simulated: simulatedSession.simulated } })
  const receipt = await prisma.altanaExecution.create({ data: { id: `exec_${crypto.randomUUID()}`, agentId: agent.id, walletId: wallet.id, sessionId: altanaSession.id, action: action.action, target: action.target, value: action.value, status, simulated: Boolean(decision.simulated), rejectionReason: decision.approved ? null : decision.reason } })
  return { receiptId: receipt.id, status, simulated: Boolean(decision.simulated), score, pipeline: ['AGENT_RESOLVED', 'KYМERA_SCORE_READ', 'GUARD_EVALUATED', 'ALTANA_SESSION_CHECKED', 'EXECUTION_RECORDED'], decision, action, altana: getAltanaStatus() }
}

export async function listExecutions(userAddress: string) { const wallet = await prisma.altanaWallet.findUnique({ where: { address: userAddress }, select: { id: true } }); return wallet ? prisma.altanaExecution.findMany({ where: { walletId: wallet.id }, orderBy: { createdAt: 'desc' }, take: 30 }) : [] }
