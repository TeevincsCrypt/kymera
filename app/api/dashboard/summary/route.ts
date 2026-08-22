import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireWallet } from '@/lib/auth/require'
import { allowedChainIds, mainnetEnabled } from '@/lib/guard/policy'
import { expireStaleReservations, spentForSession } from '@/lib/guard/evaluate'

export const dynamic = 'force-dynamic'

export type RiskAlert = {
  id: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  detail: string
  agentName?: string
  sessionId?: string
  at: string
}

/**
 * Everything the control centre renders, in one round trip: hired agents, live
 * sessions, recent Guard decisions, and alerts.
 *
 * Every alert is derived from a real record — a Guard rejection that happened, a
 * session that genuinely expired, a spending limit actually approaching its cap.
 * Nothing here is synthesised to make the dashboard look busy.
 */
export async function GET() {
  const auth = await requireWallet()
  if ('response' in auth) return auth.response
  const wallet = auth.address

  await expireStaleReservations().catch(() => undefined)
  const now = new Date()

  const [hires, sessions, executions, counts] = await Promise.all([
    prisma.agentHire.findMany({
      where: { userAddress: wallet },
      include: { agent: { select: { id: true, name: true, category: true, kymeraScore: true, evaluationStatus: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.agentSession.findMany({
      where: { userAddress: wallet },
      include: { agent: { select: { id: true, name: true } }, permissions: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.guardExecution.findMany({
      where: { walletAddress: wallet },
      include: { agent: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 40,
    }),
    Promise.all([
      prisma.guardExecution.count({ where: { walletAddress: wallet, decision: 'APPROVED' } }),
      prisma.guardExecution.count({ where: { walletAddress: wallet, decision: 'REJECTED' } }),
      prisma.guardExecution.count({ where: { walletAddress: wallet, status: 'CONFIRMED' } }),
    ]),
  ])

  const [approved, blocked, confirmed] = counts
  const alerts: RiskAlert[] = []

  // Sessions that ran out while still marked Active.
  for (const session of sessions) {
    const expired = session.status === 'Active' && session.expiresAt <= now
    if (expired) {
      alerts.push({
        id: `expired-${session.id}`,
        severity: 'info',
        title: 'Agent session expired',
        detail: `The Guard session for ${session.agent.name} ended on ${session.expiresAt.toLocaleString()}. It can no longer request actions.`,
        agentName: session.agent.name,
        sessionId: session.id,
        at: session.expiresAt.toISOString(),
      })
    }
  }

  // Spending limits approaching their cap, computed from committed executions.
  const active = sessions.filter((session) => session.status === 'Active' && session.expiresAt > now && session.spendingLimit !== null)
  const usage = await Promise.all(active.map(async (session) => {
    const spent = await spentForSession(session.id, 'BNB').catch(() => null)
    return { session, spent }
  }))
  for (const { session, spent } of usage) {
    if (!spent || session.spendingLimit === null) continue
    const cap = Number(session.spendingLimit)
    const used = Number(spent)
    if (cap > 0 && used / cap >= 0.8) {
      alerts.push({
        id: `cap-${session.id}`,
        severity: used >= cap ? 'critical' : 'warning',
        title: used >= cap ? 'Spending limit reached' : 'Spending limit almost reached',
        detail: `${session.agent.name} has committed ${used} of its ${cap} limit. Further value-bearing actions will be refused.`,
        agentName: session.agent.name,
        sessionId: session.id,
        at: now.toISOString(),
      })
    }
  }

  // Recent Guard blocks — the most important thing a user should see.
  for (const execution of executions.filter((row) => row.decision === 'REJECTED').slice(0, 5)) {
    alerts.push({
      id: `blocked-${execution.id}`,
      severity: 'critical',
      title: 'Guard blocked an action',
      detail: `${execution.agent?.name ?? 'An agent'} requested ${execution.action} and was refused: ${execution.reason}. No transaction was submitted.`,
      agentName: execution.agent?.name,
      at: execution.createdAt.toISOString(),
    })
  }

  const severityOrder = { critical: 0, warning: 1, info: 2 } as const
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || b.at.localeCompare(a.at))

  return NextResponse.json({
    wallet,
    stats: {
      agents: hires.filter((hire) => hire.status === 'ACTIVE').length,
      sessions: sessions.filter((session) => session.status === 'Active' && session.expiresAt > now).length,
      approved,
      blocked,
      confirmed,
    },
    agents: hires.map((hire) => ({
      hireId: hire.id,
      agentId: hire.agent.id,
      name: hire.agent.name,
      category: hire.agent.category,
      score: hire.agent.kymeraScore,
      status: hire.status,
      task: hire.task,
      sessionId: hire.sessionId,
      paymentTxHash: hire.paymentTxHash,
      paymentChainId: hire.paymentChainId,
      createdAt: hire.createdAt,
    })),
    sessions: sessions.map((session) => ({
      id: session.id,
      agentId: session.agent.id,
      agentName: session.agent.name,
      status: session.status === 'Active' && session.expiresAt <= now ? 'Expired' : session.status,
      chainId: session.chainId,
      spendingLimit: session.spendingLimit ? session.spendingLimit.toString() : null,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      permissions: session.permissions.filter((item) => item.allowed).map((item) => item.permission),
    })),
    activity: executions.map((execution) => ({
      id: execution.id,
      agentId: execution.agent?.id ?? null,
      agentName: execution.agent?.name ?? null,
      action: execution.action,
      decision: execution.decision,
      reason: execution.reason,
      status: execution.status,
      chainId: execution.chainId,
      asset: execution.asset,
      amount: execution.amount.toString(),
      txHash: execution.txHash,
      createdAt: execution.createdAt,
      confirmedAt: execution.confirmedAt,
      error: execution.error,
    })),
    alerts: alerts.slice(0, 12),
    posture: {
      network: mainnetEnabled() ? 'testnet + mainnet' : 'testnet only',
      allowedChains: allowedChainIds(),
      custody: 'user-signed only',
    },
  })
}
