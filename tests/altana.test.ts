/**
 * Altana delegation tests.
 *
 * These cover the parts that decide authority — permission derivation and settlement
 * classification — without touching the network. The relay and the account contract are
 * out of reach here, so nothing in this file claims a transaction succeeded.
 */

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { parseUnits } from 'viem'
import { buildAltanaPermissions } from '@/lib/altana/permissions'
import { deriveSessionKey, altanaStatus } from '@/lib/altana/config'
import { SETTLEMENT, settlementOf } from '@/lib/guard/settlement'
import { PANCAKE_V3_ROUTER, ERC8183_ADDRESSES, normalizeAddress } from '@/lib/guard/policy'
import { evidenceCategory } from '@/lib/erc8004/adapter'

const HOUR = 60 * 60 * 1000
const expiry = () => new Date(Date.now() + 12 * HOUR)

describe('Altana session permissions', () => {
  test('a read-only session can call nothing at all', () => {
    const built = buildAltanaPermissions({ chainId: 97, permissions: ['read_market_data', 'analyze_positions'], spendingLimit: 5, expiresAt: expiry() })
    // An empty array is not the same as an absent one: the SDK reads an absent `calls`
    // as "every target allowed", so this must stay an explicit empty allowlist.
    assert.ok(Array.isArray(built.permissions.calls))
    assert.equal(built.permissions.calls?.length, 0)
    assert.deepEqual(built.protocols, [])
  })

  test('execute_trades allows the PancakeSwap router and nothing else by address', () => {
    const built = buildAltanaPermissions({ chainId: 97, permissions: ['execute_trades'], spendingLimit: 1, expiresAt: expiry() })
    const targets = (built.permissions.calls ?? [])
      .map((call) => ('to' in call ? normalizeAddress(call.to) : null))
      .filter(Boolean)
    assert.deepEqual([...new Set(targets)], [normalizeAddress(PANCAKE_V3_ROUTER[97])])
  })

  test('submit_transactions allows the ERC-8183 contract but not the router', () => {
    const built = buildAltanaPermissions({ chainId: 97, permissions: ['submit_transactions'], spendingLimit: null, expiresAt: expiry() })
    const targets = (built.permissions.calls ?? [])
      .map((call) => ('to' in call ? normalizeAddress(call.to) : null))
      .filter(Boolean)
    assert.ok(targets.includes(normalizeAddress(ERC8183_ADDRESSES.agenticCommerce)))
    assert.ok(!targets.includes(normalizeAddress(PANCAKE_V3_ROUTER[97])))
  })

  test('a session with no spending limit grants no spend permission', () => {
    const built = buildAltanaPermissions({ chainId: 97, permissions: ['execute_trades'], spendingLimit: null, expiresAt: expiry() })
    assert.deepEqual(built.permissions.spend, [])
  })

  test('the spend cap is carried on-chain in wei', () => {
    const built = buildAltanaPermissions({ chainId: 97, permissions: ['execute_trades'], spendingLimit: 0.25, expiresAt: expiry() })
    assert.equal(built.permissions.spend?.[0]?.limit, parseUnits('0.25', 18))
  })

  test('the rolling period is never shorter than the session, so it cannot reject what Guard allows', () => {
    const short = buildAltanaPermissions({ chainId: 97, permissions: ['execute_trades'], spendingLimit: 1, expiresAt: new Date(Date.now() + 30 * 60 * 1000) })
    const long = buildAltanaPermissions({ chainId: 97, permissions: ['execute_trades'], spendingLimit: 1, expiresAt: new Date(Date.now() + 20 * 24 * HOUR) })
    assert.equal(short.permissions.spend?.[0]?.period, 'hour')
    assert.equal(long.permissions.spend?.[0]?.period, 'month')
  })

  test('move_funds grants nothing even if it somehow reaches this layer', () => {
    const built = buildAltanaPermissions({ chainId: 97, permissions: ['move_funds'], spendingLimit: 10, expiresAt: expiry() })
    assert.equal(built.permissions.calls?.length, 0)
  })

  test('an unsupported chain yields no callable target', () => {
    const built = buildAltanaPermissions({ chainId: 1, permissions: ['execute_trades', 'submit_transactions'], spendingLimit: 1, expiresAt: expiry() })
    assert.equal(built.permissions.calls?.length, 0)
  })
})

describe('Altana configuration', () => {
  test('reports itself unavailable, with a reason, when no admin key is set', () => {
    const status = altanaStatus()
    assert.equal(status.available, false)
    assert.equal(status.reason, 'ALTANA_ADMIN_KEY_NOT_CONFIGURED')
    assert.equal(status.chainId, 97)
  })

  test('no session key can be derived without an admin key', () => {
    assert.equal(deriveSessionKey('session-1'), null)
  })

  test('derived session keys are deterministic per session and differ between sessions', () => {
    process.env.ALTANA_ADMIN_PRIVATE_KEY = `0x${'11'.repeat(32)}`
    try {
      const first = deriveSessionKey('session-a')
      const second = deriveSessionKey('session-a')
      const other = deriveSessionKey('session-b')
      assert.equal(first, second)
      assert.notEqual(first, other)
      assert.match(String(first), /^0x[0-9a-f]{64}$/)
      // The derived key must never be the admin key itself.
      assert.notEqual(first, process.env.ALTANA_ADMIN_PRIVATE_KEY)
    } finally {
      delete process.env.ALTANA_ADMIN_PRIVATE_KEY
    }
  })
})

describe('Settlement state', () => {
  const base = { decision: 'APPROVED', status: 'AUTHORIZED', txHash: null, metadata: null }

  test('a Guard rejection is BLOCKED regardless of anything else on the row', () => {
    assert.equal(settlementOf({ ...base, decision: 'REJECTED', status: 'REJECTED' }).settlement, SETTLEMENT.blocked)
  })

  test('an approved but unsigned authorization is never shown as on-chain', () => {
    const result = settlementOf(base)
    assert.equal(result.settlement, SETTLEMENT.awaiting)
    assert.equal(result.submittedBy, null)
  })

  test('a transaction hash means on-chain, attributed to the user wallet by default', () => {
    const result = settlementOf({ ...base, status: 'SUBMITTED', txHash: `0x${'ab'.repeat(32)}` })
    assert.equal(result.settlement, SETTLEMENT.onchain)
    assert.equal(result.submittedBy, 'USER_WALLET')
  })

  test('an Altana submission is attributed to the agent wallet', () => {
    const result = settlementOf({ ...base, status: 'CONFIRMED', txHash: `0x${'cd'.repeat(32)}`, metadata: { executionMode: 'ALTANA_SESSION' } })
    assert.equal(result.settlement, SETTLEMENT.onchain)
    assert.equal(result.submittedBy, 'ALTANA_SESSION')
  })

  test('a cancelled authorization is not settled and claims no submitter', () => {
    const result = settlementOf({ ...base, status: 'CANCELLED' })
    assert.equal(result.settlement, SETTLEMENT.unsettled)
    assert.equal(result.submittedBy, null)
  })
})

describe('Strategy categories', () => {
  const cases: Array<[string, string]> = [
    ['Keeps a portfolio at its target weights and rebalances on drift', 'Rebalancing'],
    ['Automated grid trading bot placing laddered orders across a range', 'Grid Trading'],
    ['Auto-compounding vault that optimises yield across farms', 'Yield Optimisation'],
    ['Watches your health factor and warns before liquidation risk', 'Health Factor Monitoring'],
  ]

  for (const [description, expected] of cases) {
    test(`"${description.slice(0, 40)}…" is categorised as ${expected}`, () => {
      assert.equal(evidenceCategory({ description }), expected)
    })
  }

  test('the broad categories still work and are not shadowed by the new ones', () => {
    assert.equal(evidenceCategory({ description: 'Provides liquidity to a PancakeSwap pool' }), 'DeFi')
    assert.equal(evidenceCategory({ description: 'Security auditing and exploit detection' }), 'Security')
  })

  test('a declared category is honoured over inferred evidence', () => {
    assert.equal(evidenceCategory({ category: 'Grid Trading', description: 'security audit tool' }), 'Grid Trading')
  })
})
