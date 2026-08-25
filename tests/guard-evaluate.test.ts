/**
 * Canonical Guard authorization tests.
 *
 * These are the most important tests in the repository: they assert the specific
 * rules that stand between an agent request and a user's funds. Every rejection path
 * is exercised, and each asserts the exact deterministic reason code.
 */

import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluateGuard } from '@/lib/guard/evaluate'
import { PANCAKE_V3_ROUTER, ERC8183_ADDRESSES } from '@/lib/guard/policy'
import { WALLET_A, WALLET_B, createAgent, createSession, prisma, recordSpend, resetDatabase } from './helpers/db'

const ROUTER = PANCAKE_V3_ROUTER[97]
const JOB_CONTRACT = ERC8183_ADDRESSES.agenticCommerce

function swapRequest(overrides: Record<string, unknown> = {}) {
  return {
    wallet: WALLET_A,
    chainId: 97,
    action: 'swap',
    to: ROUTER,
    method: 'exactInputSingle',
    asset: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    amount: '0.1',
    ...overrides,
  }
}

describe('Kymera Guard — authorization decisions', () => {
  before(async () => { await resetDatabase() })
  after(async () => { await prisma.$disconnect() })

  test('approves a valid, in-limit swap request', async () => {
    await resetDatabase()
    const agent = await createAgent()
    const session = await createSession({ agentId: agent.id, spendingLimit: 1 })

    const decision = await evaluateGuard(swapRequest({ sessionId: session.id, agentId: agent.id }))

    assert.equal(decision.allowed, true)
    assert.equal(decision.reason, 'APPROVED')
    assert.ok(decision.checks.every((check) => check.status !== 'failed'))
  })

  test('rejects an expired session', async () => {
    await resetDatabase()
    const agent = await createAgent()
    const session = await createSession({ agentId: agent.id, expiresInHours: -1 })

    const decision = await evaluateGuard(swapRequest({ sessionId: session.id }))

    assert.equal(decision.allowed, false)
    assert.equal(decision.reason, 'SESSION_EXPIRED')
  })

  test('rejects a revoked session', async () => {
    await resetDatabase()
    const agent = await createAgent()
    const session = await createSession({ agentId: agent.id, status: 'Revoked' })

    const decision = await evaluateGuard(swapRequest({ sessionId: session.id }))

    assert.equal(decision.allowed, false)
    assert.equal(decision.reason, 'SESSION_REVOKED')
  })

  test('rejects a session owned by a different wallet', async () => {
    await resetDatabase()
    const agent = await createAgent()
    const session = await createSession({ agentId: agent.id, wallet: WALLET_A })

    // WALLET_B attempts to use WALLET_A's session.
    const decision = await evaluateGuard(swapRequest({ wallet: WALLET_B, sessionId: session.id }))

    assert.equal(decision.allowed, false)
    assert.equal(decision.reason, 'WRONG_WALLET')
  })

  test('rejects an unsupported chain', async () => {
    await resetDatabase()
    const agent = await createAgent()
    const session = await createSession({ agentId: agent.id })

    // Ethereum mainnet is not an allowed Kymera execution chain.
    const decision = await evaluateGuard(swapRequest({ sessionId: session.id, chainId: 1 }))

    assert.equal(decision.allowed, false)
    assert.equal(decision.reason, 'CHAIN_NOT_ALLOWED')
  })

  test('rejects when the wallet is on a different chain than the action', async () => {
    await resetDatabase()
    const agent = await createAgent()
    const session = await createSession({ agentId: agent.id })

    const decision = await evaluateGuard(swapRequest({ sessionId: session.id, walletChainId: 56 }))

    assert.equal(decision.allowed, false)
    assert.equal(decision.reason, 'CHAIN_MISMATCH')
  })

  test('rejects a contract that is not allowlisted', async () => {
    await resetDatabase()
    const agent = await createAgent()
    const session = await createSession({ agentId: agent.id })

    const decision = await evaluateGuard(swapRequest({ sessionId: session.id, to: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' }))

    assert.equal(decision.allowed, false)
    assert.equal(decision.reason, 'CONTRACT_NOT_ALLOWLISTED')
  })

  test('rejects a method that is not allowlisted on an allowed contract', async () => {
    await resetDatabase()
    const agent = await createAgent()
    const session = await createSession({ agentId: agent.id })

    const decision = await evaluateGuard(swapRequest({ sessionId: session.id, method: 'transferOwnership' }))

    assert.equal(decision.allowed, false)
    assert.equal(decision.reason, 'METHOD_NOT_ALLOWLISTED')
  })

  test('rejects an action whose permission was not granted', async () => {
    await resetDatabase()
    const agent = await createAgent()
    // Read-only session: no execute_trades.
    const session = await createSession({ agentId: agent.id, permissions: ['read_market_data'] })

    const decision = await evaluateGuard(swapRequest({ sessionId: session.id }))

    assert.equal(decision.allowed, false)
    assert.equal(decision.reason, 'PERMISSION_NOT_GRANTED')
  })

  test('rejects a request that exceeds the spending cap', async () => {
    await resetDatabase()
    const agent = await createAgent()
    const session = await createSession({ agentId: agent.id, spendingLimit: 0.2 })

    // The scenario from the brief: cap 0.2, request 0.5 -> rejected.
    const decision = await evaluateGuard(swapRequest({ sessionId: session.id, amount: '0.5' }))

    assert.equal(decision.allowed, false)
    assert.equal(decision.reason, 'SPENDING_CAP_EXCEEDED')
  })

  test('allows a request within the spending cap', async () => {
    await resetDatabase()
    const agent = await createAgent()
    const session = await createSession({ agentId: agent.id, spendingLimit: 0.2 })

    // Cap 0.2, request 0.1 -> approved.
    const decision = await evaluateGuard(swapRequest({ sessionId: session.id, amount: '0.1' }))

    assert.equal(decision.allowed, true)
    assert.equal(decision.reason, 'APPROVED')
  })

  test('counts spending cumulatively across the session', async () => {
    await resetDatabase()
    const agent = await createAgent()
    const session = await createSession({ agentId: agent.id, spendingLimit: 0.2 })
    const asset = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

    // 0.15 already committed; a further 0.1 would total 0.25 and breach the 0.2 cap.
    await recordSpend({ sessionId: session.id, agentId: agent.id, asset, amount: 0.15 })
    const decision = await evaluateGuard(swapRequest({ sessionId: session.id, amount: '0.1', asset }))

    assert.equal(decision.allowed, false)
    assert.equal(decision.reason, 'SPENDING_CAP_EXCEEDED')
    assert.equal(decision.metadata.spentBefore, '0.15')
  })

  test('cancelled and rejected history does not consume cap headroom', async () => {
    await resetDatabase()
    const agent = await createAgent()
    const session = await createSession({ agentId: agent.id, spendingLimit: 0.2 })
    const asset = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

    await recordSpend({ sessionId: session.id, agentId: agent.id, asset, amount: 0.15, status: 'CANCELLED' })
    const decision = await evaluateGuard(swapRequest({ sessionId: session.id, amount: '0.1', asset }))

    assert.equal(decision.allowed, true)
  })

  test('refuses value-bearing actions when no spending limit was set', async () => {
    await resetDatabase()
    const agent = await createAgent()
    const session = await createSession({ agentId: agent.id, spendingLimit: null })

    const decision = await evaluateGuard(swapRequest({ sessionId: session.id, amount: '0.1' }))

    assert.equal(decision.allowed, false)
    assert.equal(decision.reason, 'SPENDING_CAP_UNSET')
  })

  test('allows a zero-value job creation without a spending limit', async () => {
    await resetDatabase()
    const agent = await createAgent()
    const session = await createSession({ agentId: agent.id, spendingLimit: null, permissions: ['submit_transactions'] })

    const decision = await evaluateGuard({
      wallet: WALLET_A, chainId: 97, action: 'create_job', to: JOB_CONTRACT, method: 'createJob', amount: '0', sessionId: session.id,
    })

    assert.equal(decision.allowed, true)
  })

  test('rejects a token approval whose spender is not an allowlisted router', async () => {
    await resetDatabase()
    const agent = await createAgent()
    const session = await createSession({ agentId: agent.id, spendingLimit: 5 })

    const decision = await evaluateGuard({
      wallet: WALLET_A,
      chainId: 97,
      action: 'approve_token',
      to: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      method: 'approve',
      amount: '1',
      asset: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      spender: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      sessionId: session.id,
    })

    assert.equal(decision.allowed, false)
    assert.equal(decision.reason, 'SPENDER_NOT_ALLOWLISTED')
  })

  test('rejects an unknown action type', async () => {
    await resetDatabase()
    const agent = await createAgent()
    const session = await createSession({ agentId: agent.id })

    const decision = await evaluateGuard(swapRequest({ sessionId: session.id, action: 'drain_wallet' }))

    assert.equal(decision.allowed, false)
    assert.equal(decision.reason, 'ACTION_NOT_SUPPORTED')
  })

  test('rejects when no session exists for the wallet', async () => {
    await resetDatabase()
    await createAgent()

    const decision = await evaluateGuard(swapRequest())

    assert.equal(decision.allowed, false)
    assert.equal(decision.reason, 'SESSION_NOT_FOUND')
  })

  test('rejects a session issued for a different agent', async () => {
    await resetDatabase()
    const agentA = await createAgent({ name: 'Agent A' })
    const agentB = await createAgent({ name: 'Agent B' })
    const session = await createSession({ agentId: agentA.id })

    const decision = await evaluateGuard(swapRequest({ sessionId: session.id, agentId: agentB.id }))

    assert.equal(decision.allowed, false)
    assert.equal(decision.reason, 'AGENT_MISMATCH')
  })

  test('rejects a malformed wallet address', async () => {
    const decision = await evaluateGuard(swapRequest({ wallet: 'not-an-address' }))
    assert.equal(decision.allowed, false)
    assert.equal(decision.reason, 'WALLET_INVALID')
  })

  test('rejects a missing wallet', async () => {
    const decision = await evaluateGuard(swapRequest({ wallet: '' }))
    assert.equal(decision.allowed, false)
    assert.equal(decision.reason, 'WALLET_REQUIRED')
  })
})
