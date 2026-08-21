/**
 * Kymera Guard — the canonical authorization decision.
 *
 * `evaluateGuard` is the ONLY place in Kymera that decides whether an on-chain
 * action may proceed. Every execution surface (PancakeSwap, ERC-8183, and anything
 * added later) must call it, and must refuse to touch the user's wallet unless it
 * returns `allowed: true`.
 */

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  ACTION_CONSUMES_CAP,
  ACTION_IS_VALUE_BEARING,
  ACTION_PERMISSION,
  BLOCKED_PERMISSIONS,
  ERC20_APPROVE_METHOD,
  GUARD_REASONS,
  GUARD_REASON_COPY,
  type GuardAction,
  type GuardPermission,
  type GuardReason,
  allowedChainIds,
  contractRuleFor,
  isAddress,
  isAllowlistedSpender,
  isGuardAction,
  normalizeAddress,
} from './policy'

const Decimal = Prisma.Decimal

/** Statuses that hold spending-cap headroom. Anything else has released it. */
export const CAP_CONSUMING_STATUSES = ['AUTHORIZED', 'SUBMITTED', 'CONFIRMED'] as const

/** How long an approved-but-unsigned authorization reserves cap headroom. */
export const RESERVATION_WINDOW_MS = 15 * 60 * 1000

export const NATIVE_ASSET = 'BNB'

export type GuardRequestInput = {
  /** Authenticated wallet. Callers MUST pass the address proven by the auth session. */
  wallet: string
  agentId?: string | null
  sessionId?: string | null
  chainId: number
  action: string
  to: string
  method: string
  /** Decimal string, in whole units of `asset`. */
  amount?: string | number | null
  /** 'BNB' for native value, otherwise the ERC-20 contract address. */
  asset?: string | null
  /** Required for `approve_token`: the address being granted an allowance. */
  spender?: string | null
  /** The chain the wallet is currently connected to, if known. */
  walletChainId?: number | null
}

export type GuardCheck = {
  id: string
  label: string
  status: 'passed' | 'failed' | 'not_evaluated'
  detail?: string
}

export type GuardDecision = {
  allowed: boolean
  reason: GuardReason
  message: string
  checks: GuardCheck[]
  metadata: {
    action: string
    chainId: number
    to: string
    method: string
    asset: string
    amount: string
    wallet: string
    sessionId: string | null
    agentId: string | null
    spendingLimit: string | null
    spentBefore: string | null
    remainingAfter: string | null
    /** True when this action's amount should be committed against the cap on record. */
    consumesCap: boolean
    evaluatedAt: string
  }
}

const CHECK_SEQUENCE: Array<{ id: string; label: string }> = [
  { id: 'wallet', label: 'Authenticated wallet' },
  { id: 'action', label: 'Supported action type' },
  { id: 'chain', label: 'Network allowed for execution' },
  { id: 'session', label: 'Guard session exists' },
  { id: 'session_owner', label: 'Session belongs to this wallet' },
  { id: 'session_status', label: 'Session active and not revoked' },
  { id: 'session_expiry', label: 'Session not expired' },
  { id: 'agent', label: 'Agent matches session' },
  { id: 'permission', label: 'Session grants required permission' },
  { id: 'contract', label: 'Target contract allowlisted' },
  { id: 'method', label: 'Contract method allowlisted' },
  { id: 'amount', label: 'Amount well-formed' },
  { id: 'spending_cap', label: 'Within session spending limit' },
]

function buildChecks() {
  const checks: GuardCheck[] = CHECK_SEQUENCE.map((item) => ({ ...item, status: 'not_evaluated' as const }))
  const pass = (id: string, detail?: string) => {
    const entry = checks.find((check) => check.id === id)
    if (entry) { entry.status = 'passed'; entry.detail = detail }
  }
  const fail = (id: string, detail?: string) => {
    const entry = checks.find((check) => check.id === id)
    if (entry) { entry.status = 'failed'; entry.detail = detail }
  }
  return { checks, pass, fail }
}

/**
 * Release cap headroom held by authorizations the user never signed. Self-healing so
 * an abandoned "Review in wallet" prompt does not permanently consume a session's limit.
 */
export async function expireStaleReservations(sessionId?: string) {
  return prisma.guardExecution.updateMany({
    where: {
      status: 'AUTHORIZED',
      reservationExpiresAt: { lt: new Date() },
      ...(sessionId ? { sessionId } : {}),
    },
    data: { status: 'EXPIRED', error: 'RESERVATION_EXPIRED' },
  })
}

/** Sum of cap-consuming amounts already committed for a session + asset. */
export async function spentForSession(sessionId: string, asset: string) {
  const result = await prisma.guardExecution.aggregate({
    where: { sessionId, asset, status: { in: [...CAP_CONSUMING_STATUSES] }, decision: 'APPROVED' },
    _sum: { amount: true },
  })
  return result._sum.amount ?? new Decimal(0)
}

export async function evaluateGuard(input: GuardRequestInput): Promise<GuardDecision> {
  const { checks, pass, fail } = buildChecks()
  const wallet = normalizeAddress(input.wallet)
  const to = normalizeAddress(input.to)
  const asset = input.asset ? (input.asset === NATIVE_ASSET ? NATIVE_ASSET : normalizeAddress(input.asset)) : NATIVE_ASSET
  const method = typeof input.method === 'string' ? input.method.trim() : ''

  let amount: Prisma.Decimal
  try {
    amount = new Decimal(input.amount === undefined || input.amount === null || input.amount === '' ? 0 : String(input.amount))
  } catch {
    amount = new Decimal(-1)
  }

  const metadata: GuardDecision['metadata'] = {
    action: String(input.action ?? ''),
    chainId: Number(input.chainId),
    to,
    method,
    asset,
    amount: amount.isNegative() ? String(input.amount) : amount.toString(),
    wallet,
    sessionId: input.sessionId ?? null,
    agentId: input.agentId ?? null,
    spendingLimit: null,
    spentBefore: null,
    remainingAfter: null,
    consumesCap: isGuardAction(input.action) ? ACTION_CONSUMES_CAP[input.action] : false,
    evaluatedAt: new Date().toISOString(),
  }

  const deny = (reason: GuardReason): GuardDecision => ({
    allowed: false,
    reason,
    message: GUARD_REASON_COPY[reason],
    checks,
    metadata,
  })

  // 1. Authenticated wallet ---------------------------------------------------
  if (!wallet) { fail('wallet', 'No authenticated wallet supplied'); return deny(GUARD_REASONS.WALLET_REQUIRED) }
  if (!isAddress(wallet)) { fail('wallet', 'Malformed address'); return deny(GUARD_REASONS.WALLET_INVALID) }
  pass('wallet', wallet)

  // 2. Action type ------------------------------------------------------------
  if (!isGuardAction(input.action)) { fail('action', `Unknown action '${input.action}'`); return deny(GUARD_REASONS.ACTION_NOT_SUPPORTED) }
  const action: GuardAction = input.action
  pass('action', action)

  // 3. Chain ------------------------------------------------------------------
  const chainId = Number(input.chainId)
  const permittedChains = allowedChainIds()
  if (!Number.isInteger(chainId) || !permittedChains.includes(chainId)) {
    fail('chain', `Chain ${input.chainId} is not enabled (allowed: ${permittedChains.join(', ')})`)
    return deny(GUARD_REASONS.CHAIN_NOT_ALLOWED)
  }
  if (input.walletChainId !== undefined && input.walletChainId !== null && Number(input.walletChainId) !== chainId) {
    fail('chain', `Wallet is on chain ${input.walletChainId}, action targets ${chainId}`)
    return deny(GUARD_REASONS.CHAIN_MISMATCH)
  }
  pass('chain', `chain ${chainId}`)

  // 4. Session ----------------------------------------------------------------
  const session = input.sessionId
    ? await prisma.agentSession.findUnique({ where: { id: input.sessionId }, include: { permissions: true } })
    : await prisma.agentSession.findFirst({
        where: { userAddress: { equals: wallet, mode: 'insensitive' }, status: 'Active', ...(input.agentId ? { agentId: input.agentId } : {}) },
        orderBy: { createdAt: 'desc' },
        include: { permissions: true },
      })

  if (!session) { fail('session', 'No Guard session found for this wallet'); return deny(GUARD_REASONS.SESSION_NOT_FOUND) }
  metadata.sessionId = session.id
  pass('session', session.id)

  // 5. Session ownership — the core anti-impersonation check -------------------
  if (normalizeAddress(session.userAddress) !== wallet) {
    fail('session_owner', 'Session is owned by a different wallet')
    return deny(GUARD_REASONS.WRONG_WALLET)
  }
  pass('session_owner')

  // 6. Session status ---------------------------------------------------------
  if (session.status === 'Revoked' || session.revokedAt) { fail('session_status', 'Session revoked'); return deny(GUARD_REASONS.SESSION_REVOKED) }
  if (session.status !== 'Active') { fail('session_status', `Status is ${session.status}`); return deny(GUARD_REASONS.SESSION_INACTIVE) }
  pass('session_status')

  // 7. Session expiry ---------------------------------------------------------
  if (session.expiresAt.getTime() <= Date.now()) { fail('session_expiry', `Expired ${session.expiresAt.toISOString()}`); return deny(GUARD_REASONS.SESSION_EXPIRED) }
  pass('session_expiry', `valid until ${session.expiresAt.toISOString()}`)

  // 8. Agent ------------------------------------------------------------------
  if (input.agentId && input.agentId !== session.agentId) {
    fail('agent', `Session was issued for agent ${session.agentId}`)
    return deny(GUARD_REASONS.AGENT_MISMATCH)
  }
  metadata.agentId = session.agentId
  pass('agent', session.agentId)

  // 9. Permission -------------------------------------------------------------
  const required: GuardPermission = ACTION_PERMISSION[action]
  if (BLOCKED_PERMISSIONS.includes(required)) { fail('permission', `${required} is blocked by Kymera policy`); return deny(GUARD_REASONS.PERMISSION_BLOCKED) }
  const granted = session.permissions.some((item) => item.permission === required && item.allowed)
  if (!granted) { fail('permission', `Session does not grant ${required}`); return deny(GUARD_REASONS.PERMISSION_NOT_GRANTED) }
  pass('permission', required)

  // 10 & 11. Contract + method allowlists --------------------------------------
  if (action === 'approve_token') {
    // The token contract is arbitrary, so the meaningful check is the spender.
    if (!isAddress(to)) { fail('contract', 'Token address malformed'); return deny(GUARD_REASONS.ADDRESS_INVALID) }
    const spender = normalizeAddress(input.spender)
    if (!isAddress(spender)) { fail('contract', 'Spender address malformed'); return deny(GUARD_REASONS.ADDRESS_INVALID) }
    if (!isAllowlistedSpender(chainId, spender)) {
      fail('contract', `Spender ${spender} is not an allowlisted Kymera router`)
      return deny(GUARD_REASONS.SPENDER_NOT_ALLOWLISTED)
    }
    pass('contract', `approval spender ${spender}`)
    if (method !== ERC20_APPROVE_METHOD) { fail('method', `Expected ${ERC20_APPROVE_METHOD}, got '${method}'`); return deny(GUARD_REASONS.METHOD_NOT_ALLOWLISTED) }
    pass('method', method)
  } else {
    const rule = contractRuleFor(chainId, to)
    if (!rule) { fail('contract', `${to} is not allowlisted on chain ${chainId}`); return deny(GUARD_REASONS.CONTRACT_NOT_ALLOWLISTED) }
    if (!rule.actions.includes(action)) { fail('contract', `${rule.label} does not permit action ${action}`); return deny(GUARD_REASONS.ACTION_NOT_ALLOWED) }
    pass('contract', rule.label)
    if (!rule.methods.includes(method)) { fail('method', `'${method}' not permitted on ${rule.label}`); return deny(GUARD_REASONS.METHOD_NOT_ALLOWLISTED) }
    pass('method', method)
  }

  // 12. Amount ----------------------------------------------------------------
  if (amount.isNegative() || !amount.isFinite()) { fail('amount', `Invalid amount '${input.amount}'`); return deny(GUARD_REASONS.AMOUNT_INVALID) }
  pass('amount', `${amount.toString()} ${asset}`)

  // 13. Spending cap ----------------------------------------------------------
  const valueBearing = ACTION_IS_VALUE_BEARING[action] && amount.greaterThan(0)
  if (!valueBearing) {
    pass('spending_cap', 'Action moves no value')
    return { allowed: true, reason: GUARD_REASONS.APPROVED, message: GUARD_REASON_COPY.APPROVED, checks, metadata }
  }

  if (session.spendingLimit === null || session.spendingLimit === undefined) {
    fail('spending_cap', 'Session has no spending limit set')
    return deny(GUARD_REASONS.SPENDING_CAP_UNSET)
  }

  await expireStaleReservations(session.id)
  const cap = new Decimal(session.spendingLimit.toString())
  const spent = await spentForSession(session.id, asset)
  const projected = spent.plus(amount)
  metadata.spendingLimit = cap.toString()
  metadata.spentBefore = spent.toString()

  if (projected.greaterThan(cap)) {
    fail('spending_cap', `${projected.toString()} would exceed the ${cap.toString()} ${asset} limit (already committed: ${spent.toString()})`)
    return deny(GUARD_REASONS.SPENDING_CAP_EXCEEDED)
  }

  metadata.remainingAfter = cap.minus(projected).toString()
  pass('spending_cap', `${projected.toString()} of ${cap.toString()} ${asset}`)

  return { allowed: true, reason: GUARD_REASONS.APPROVED, message: GUARD_REASON_COPY.APPROVED, checks, metadata }
}
