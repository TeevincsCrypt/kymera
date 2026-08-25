/**
 * Execution-path tests.
 *
 * The invariant under test: a rejected Guard decision yields NO prepared transaction.
 * Since the client can only sign calldata the server returned, "no transaction
 * prepared" is what makes "the wallet is never prompted" structurally true rather
 * than a UI convention.
 */

import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { authorizeAction } from '@/lib/guard/execute'
import { revokeGuardSession, GuardInputError, createGuardSession } from '@/lib/guard/sessions'
import { WALLET_A, WALLET_B, createAgent, createSession, prisma, resetDatabase } from './helpers/db'

const TOKEN_IN = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const TOKEN_OUT = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

describe('Guard execution path', () => {
  after(async () => { await prisma.$disconnect() })

  test('a rejected decision prepares no transaction and no executionId', async () => {
    await resetDatabase()
    const agent = await createAgent()
    const session = await createSession({ agentId: agent.id, spendingLimit: 0.2 })

    const result = await authorizeAction({
      wallet: WALLET_A, agentId: agent.id, sessionId: session.id, chainId: 97,
      action: 'swap', token: TOKEN_IN, tokenOut: TOKEN_OUT, decimals: 18,
      amount: '0.5', // over the 0.2 cap
    })

    assert.equal(result.decision.allowed, false)
    assert.equal(result.decision.reason, 'SPENDING_CAP_EXCEEDED')
    // This is the security-critical assertion.
    assert.equal(result.transaction, null)
    assert.equal(result.executionId, null)
  })

  test('a rejected decision is written to the audit ledger', async () => {
    await resetDatabase()
    const agent = await createAgent()
    const session = await createSession({ agentId: agent.id, spendingLimit: 0.2 })

    await authorizeAction({
      wallet: WALLET_A, agentId: agent.id, sessionId: session.id, chainId: 97,
      action: 'swap', token: TOKEN_IN, tokenOut: TOKEN_OUT, decimals: 18, amount: '0.5',
    })

    const rejected = await prisma.guardExecution.findFirst({ where: { sessionId: session.id, decision: 'REJECTED' } })
    assert.ok(rejected, 'a rejection row should exist')
    assert.equal(rejected.reason, 'SPENDING_CAP_EXCEEDED')
    assert.equal(rejected.status, 'REJECTED')
    // A rejection must never reserve spending headroom.
    assert.equal(rejected.amount.toString(), '0')

    const audit = await prisma.agentAuditLog.findFirst({ where: { sessionId: session.id, action: 'GUARD_REJECTED' } })
    assert.ok(audit, 'a GUARD_REJECTED audit entry should exist')
  })

  test('an unauthorized contract is refused before any transaction is built', async () => {
    await resetDatabase()
    const agent = await createAgent()
    const session = await createSession({ agentId: agent.id, spendingLimit: 5, permissions: ['read_market_data'] })

    const result = await authorizeAction({
      wallet: WALLET_A, agentId: agent.id, sessionId: session.id, chainId: 97,
      action: 'swap', token: TOKEN_IN, tokenOut: TOKEN_OUT, decimals: 18, amount: '0.1',
    })

    assert.equal(result.decision.allowed, false)
    assert.equal(result.decision.reason, 'PERMISSION_NOT_GRANTED')
    assert.equal(result.transaction, null)
  })

  test('mainnet execution is refused while KYMERA_ENABLE_MAINNET is unset', async () => {
    await resetDatabase()
    const agent = await createAgent()
    const session = await createSession({ agentId: agent.id, spendingLimit: 5 })

    const result = await authorizeAction({
      wallet: WALLET_A, agentId: agent.id, sessionId: session.id, chainId: 56,
      action: 'swap', token: TOKEN_IN, tokenOut: TOKEN_OUT, decimals: 18, amount: '0.1',
    })

    assert.equal(result.decision.allowed, false)
    assert.equal(result.decision.reason, 'CHAIN_NOT_ALLOWED')
    assert.equal(result.transaction, null)
  })
})

describe('Guard session ownership', () => {
  after(async () => { await prisma.$disconnect() })

  test('a wallet cannot revoke another wallet’s session', async () => {
    await resetDatabase()
    const agent = await createAgent()
    const session = await createSession({ agentId: agent.id, wallet: WALLET_A })

    await assert.rejects(
      () => revokeGuardSession(session.id, WALLET_B),
      (error: unknown) => error instanceof GuardInputError && error.code === 'WRONG_WALLET',
    )

    const unchanged = await prisma.agentSession.findUnique({ where: { id: session.id } })
    assert.equal(unchanged?.status, 'Active')
  })

  test('the owner can revoke, and outstanding authorizations are cancelled', async () => {
    await resetDatabase()
    const agent = await createAgent()
    const session = await createSession({ agentId: agent.id, wallet: WALLET_A })
    await prisma.guardExecution.create({
      data: {
        id: 'gx_pending', sessionId: session.id, agentId: agent.id, walletAddress: WALLET_A.toLowerCase(),
        action: 'swap', chainId: 97, toAddress: '0x0', method: 'exactInputSingle', asset: 'BNB',
        amount: 0.1, decision: 'APPROVED', reason: 'APPROVED', status: 'AUTHORIZED', txDataHash: 'x', checks: [],
      },
    })

    await revokeGuardSession(session.id, WALLET_A)

    const revoked = await prisma.agentSession.findUnique({ where: { id: session.id } })
    assert.equal(revoked?.status, 'Revoked')
    const execution = await prisma.guardExecution.findUnique({ where: { id: 'gx_pending' } })
    assert.equal(execution?.status, 'CANCELLED')
  })

  test('move_funds can never be granted through a session', async () => {
    await resetDatabase()
    const agent = await createAgent()

    await assert.rejects(
      () => createGuardSession({ agentId: agent.id, userAddress: WALLET_A, durationHours: 24, permissions: ['move_funds'] }),
      (error: unknown) => error instanceof GuardInputError && error.code === 'PERMISSION_BLOCKED',
    )
  })

  test('an unknown permission is refused rather than silently dropped', async () => {
    await resetDatabase()
    const agent = await createAgent()

    await assert.rejects(
      () => createGuardSession({ agentId: agent.id, userAddress: WALLET_A, durationHours: 24, permissions: ['admin_everything'] }),
      (error: unknown) => error instanceof GuardInputError && error.code === 'UNSUPPORTED_PERMISSION',
    )
  })

  test('session duration is bounded', async () => {
    await resetDatabase()
    const agent = await createAgent()

    await assert.rejects(
      () => createGuardSession({ agentId: agent.id, userAddress: WALLET_A, durationHours: 100_000, permissions: ['read_market_data'] }),
      (error: unknown) => error instanceof GuardInputError && error.code === 'INVALID_DURATION',
    )
  })
})
