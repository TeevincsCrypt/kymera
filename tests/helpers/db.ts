import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'

export const WALLET_A = '0x1111111111111111111111111111111111111111'
export const WALLET_B = '0x2222222222222222222222222222222222222222'

export async function resetDatabase() {
  await prisma.guardExecution.deleteMany()
  await prisma.agentAuditLog.deleteMany()
  await prisma.agentPermission.deleteMany()
  await prisma.agentSession.deleteMany()
  await prisma.agentHire.deleteMany()
  await prisma.agentEvaluation.deleteMany()
  await prisma.benchmarkResult.deleteMany()
  await prisma.benchmark.deleteMany()
  await prisma.agentCapability.deleteMany()
  await prisma.agentPerformance.deleteMany()
  await prisma.agent.deleteMany()
  await prisma.authNonce.deleteMany()
}

export async function createAgent(overrides: Partial<{ id: string; name: string; erc8004TokenId: string }> = {}) {
  return prisma.agent.create({
    data: {
      id: overrides.id ?? `agent_${randomUUID()}`,
      name: overrides.name ?? 'Test Agent',
      description: 'An agent used in the Kymera test suite for Guard verification.',
      category: 'Trading',
      chain: 'BNB Chain',
      ownerAddress: '0x9999999999999999999999999999999999999999',
      capabilities: ['swap', 'yield'],
      supportedProtocols: ['A2A'],
      erc8004TokenId: overrides.erc8004TokenId,
      erc8004RegistryAddress: overrides.erc8004TokenId ? '0x8004A818BFB912233c491871b3d84c89A494BD9e' : undefined,
      erc8004ChainId: overrides.erc8004TokenId ? 97 : undefined,
    },
  })
}

export async function createSession(input: {
  agentId: string
  wallet?: string
  permissions?: string[]
  spendingLimit?: number | null
  status?: string
  expiresInHours?: number
}) {
  return prisma.agentSession.create({
    data: {
      id: randomUUID(),
      agentId: input.agentId,
      userAddress: (input.wallet ?? WALLET_A).toLowerCase(),
      spendingLimit: input.spendingLimit === null ? null : (input.spendingLimit ?? 1),
      expiresAt: new Date(Date.now() + (input.expiresInHours ?? 24) * 3600_000),
      status: input.status ?? 'Active',
      chainId: 97,
      permissions: {
        create: (input.permissions ?? ['execute_trades', 'submit_transactions']).map((permission) => ({ permission, allowed: true })),
      },
    },
    include: { permissions: true },
  })
}

/** Records a committed spend so cumulative-cap behaviour can be exercised. */
export async function recordSpend(input: { sessionId: string; agentId: string; asset: string; amount: number; wallet?: string; status?: string }) {
  return prisma.guardExecution.create({
    data: {
      id: `gx_${randomUUID()}`,
      sessionId: input.sessionId,
      agentId: input.agentId,
      walletAddress: (input.wallet ?? WALLET_A).toLowerCase(),
      action: 'swap',
      chainId: 97,
      toAddress: '0x1b81d678ffb9c0263b24a97847620c99d213eb14',
      method: 'exactInputSingle',
      asset: input.asset,
      amount: input.amount,
      decision: 'APPROVED',
      reason: 'APPROVED',
      status: input.status ?? 'CONFIRMED',
      txDataHash: 'test',
      checks: [],
    },
  })
}

export { prisma }
