/** Policy-layer tests: the allowlists themselves. */

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACTION_CONSUMES_CAP,
  ACTION_IS_VALUE_BEARING,
  ACTION_PERMISSION,
  ACTION_REQUIRES_SESSION,
  BLOCKED_PERMISSIONS,
  PANCAKE_V3_ROUTER,
  allowedChainIds,
  contractRuleFor,
  isAddress,
  isAllowlistedSpender,
  isGuardAction,
  mainnetEnabled,
} from '@/lib/guard/policy'
import { probeEndpoint, isPubliclyRoutable } from '@/lib/evaluation/probe'

describe('Guard policy', () => {
  test('mainnet is disabled by default', () => {
    assert.equal(mainnetEnabled(), false)
    assert.deepEqual(allowedChainIds(), [97])
  })

  test('the testnet PancakeSwap router is allowlisted for swaps only', () => {
    const rule = contractRuleFor(97, PANCAKE_V3_ROUTER[97])
    assert.ok(rule)
    assert.deepEqual(rule.methods, ['exactInputSingle'])
    assert.deepEqual(rule.actions, ['swap'])
  })

  test('allowlist matching is case-insensitive', () => {
    assert.ok(contractRuleFor(97, PANCAKE_V3_ROUTER[97].toUpperCase()))
    assert.ok(contractRuleFor(97, PANCAKE_V3_ROUTER[97].toLowerCase()))
  })

  test('an arbitrary contract is never allowlisted', () => {
    assert.equal(contractRuleFor(97, '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'), null)
  })

  test('only Kymera routers may be approval spenders', () => {
    assert.equal(isAllowlistedSpender(97, PANCAKE_V3_ROUTER[97]), true)
    assert.equal(isAllowlistedSpender(97, '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'), false)
  })

  test('move_funds is permanently blocked', () => {
    assert.ok(BLOCKED_PERMISSIONS.includes('move_funds'))
  })

  test('every action has an explicit permission mapping', () => {
    for (const action of Object.keys(ACTION_PERMISSION)) {
      assert.ok(isGuardAction(action))
      // null is a deliberate value, not a missing entry: it marks an action that
      // carries no delegated authority. The mapping must still be present.
      assert.ok(action in ACTION_PERMISSION)
    }
  })

  test('session-backed actions require a permission; direct payments do not', () => {
    for (const action of Object.keys(ACTION_REQUIRES_SESSION) as Array<keyof typeof ACTION_REQUIRES_SESSION>) {
      if (ACTION_REQUIRES_SESSION[action]) {
        assert.ok(ACTION_PERMISSION[action], `${action} is session-backed so it must name a permission`)
      } else {
        assert.equal(ACTION_PERMISSION[action], null, `${action} needs no session, so its permission must be null`)
      }
    }
  })

  test('hiring is a direct user payment, not a delegated agent action', () => {
    assert.equal(ACTION_REQUIRES_SESSION.hire_payment, false)
    assert.equal(ACTION_PERMISSION.hire_payment, null)
    // It moves value, so it is still amount-checked — it just is not bounded by a
    // session cap, because the hire's own agreed amount bounds it.
    assert.equal(ACTION_IS_VALUE_BEARING.hire_payment, true)
    assert.equal(ACTION_CONSUMES_CAP.hire_payment, false)
  })

  test('swaps and job submissions still require a session', () => {
    assert.equal(ACTION_REQUIRES_SESSION.swap, true)
    assert.equal(ACTION_REQUIRES_SESSION.approve_token, true)
    assert.equal(ACTION_REQUIRES_SESSION.create_job, true)
  })

  test('an approval is capped but does not consume headroom, a swap does', () => {
    assert.equal(ACTION_CONSUMES_CAP.approve_token, false)
    assert.equal(ACTION_CONSUMES_CAP.swap, true)
  })

  test('unknown actions are rejected by the type guard', () => {
    assert.equal(isGuardAction('drain_wallet'), false)
    assert.equal(isGuardAction(''), false)
    assert.equal(isGuardAction(null), false)
  })

  test('address validation', () => {
    assert.equal(isAddress('0x1111111111111111111111111111111111111111'), true)
    assert.equal(isAddress('0x111'), false)
    assert.equal(isAddress('nope'), false)
  })
})

describe('Endpoint probe SSRF protections', () => {
  test('private and loopback addresses are refused', async () => {
    assert.equal(await isPubliclyRoutable('127.0.0.1'), false)
    assert.equal(await isPubliclyRoutable('10.0.0.1'), false)
    assert.equal(await isPubliclyRoutable('192.168.1.1'), false)
    assert.equal(await isPubliclyRoutable('172.16.0.1'), false)
    assert.equal(await isPubliclyRoutable('169.254.169.254'), false, 'cloud metadata endpoint must be blocked')
    assert.equal(await isPubliclyRoutable('localhost'), false)
    assert.equal(await isPubliclyRoutable('::1'), false)
  })

  test('non-HTTPS endpoints are refused', async () => {
    const result = await probeEndpoint('http://example.com')
    assert.equal(result.reachable, false)
    assert.match(result.detail, /HTTPS/)
  })

  test('an internal HTTPS target is refused before any request is made', async () => {
    const result = await probeEndpoint('https://127.0.0.1/agent.json')
    assert.equal(result.reachable, false)
    assert.match(result.detail, /public address/)
  })

  test('a missing endpoint is unknown, not a failure', async () => {
    const result = await probeEndpoint(null)
    assert.equal(result.reachable, null)
  })
})
