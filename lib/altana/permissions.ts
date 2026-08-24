/**
 * Translation of a Kymera Guard session into Altana on-chain session permissions.
 *
 * These are derived from Guard's own contract allowlist rather than written out by
 * hand, so the on-chain delegation can never grant something Guard would refuse. The
 * two layers enforce the same boundary at different depths: Guard refuses to build the
 * calldata, and the Altana account contract's validator reverts it at execution time
 * even if the server were compromised.
 */

import { toFunctionSignature, parseUnits, type Address } from 'viem'
import type { CallPermission, SessionPermissions, SpendPermission } from '@altananetwork/sdk'
import { agenticCommerceAbi, erc20Abi, pancakeV3RouterAbi } from '@/lib/guard/abi'
import {
  ACTION_PERMISSION,
  PANCAKE_V3_ROUTER,
  allowlistedContracts,
  normalizeAddress,
  type GuardPermission,
} from '@/lib/guard/policy'

/** method name -> canonical solidity signature, taken from the ABIs Guard encodes with. */
const SIGNATURES = new Map<string, string>(
  [...erc20Abi, ...pancakeV3RouterAbi, ...agenticCommerceAbi]
    .filter((entry) => entry.type === 'function' && entry.stateMutability !== 'view')
    .map((entry) => [entry.name, toFunctionSignature(entry)]),
)

/**
 * A rolling period wide enough that Altana's cap never rejects something Guard allows.
 * Guard's cumulative per-session cap stays the binding constraint; Altana's is the
 * on-chain backstop for the same number.
 */
function periodFor(expiresAt: Date): SpendPermission['period'] {
  const hours = (expiresAt.getTime() - Date.now()) / 3_600_000
  if (hours <= 1) return 'hour'
  if (hours <= 24) return 'day'
  if (hours <= 24 * 7) return 'week'
  if (hours <= 24 * 31) return 'month'
  return 'year'
}

export type BuildPermissionsInput = {
  chainId: number
  permissions: readonly string[]
  /** Whole units of BNB. Undefined means no value-bearing action is permitted at all. */
  spendingLimit?: number | null
  expiresAt: Date
}

export type BuiltPermissions = {
  permissions: SessionPermissions
  /** Human-readable protocol labels, for the Permissions page. */
  protocols: string[]
  /** Human-readable "contract.method" list, for the Permissions page. */
  methods: string[]
}

/**
 * Build the on-chain delegation for a Guard session.
 *
 * `calls` is always an explicit allowlist — never omitted. The SDK treats an absent
 * `calls` array as "all targets allowed", which would silently hand the session key
 * unlimited authority, so a session that grants no executable permission gets an empty
 * array (nothing can be called) rather than no array.
 */
export function buildAltanaPermissions(input: BuildPermissionsInput): BuiltPermissions {
  const granted = new Set(input.permissions as GuardPermission[])
  const calls: CallPermission[] = []
  const protocols: string[] = []
  const methods: string[] = []

  for (const rule of allowlistedContracts(input.chainId)) {
    const allowed = rule.actions.some((action) => {
      const required = ACTION_PERMISSION[action]
      return required !== null && granted.has(required)
    })
    if (!allowed) continue

    protocols.push(rule.label)
    for (const method of rule.methods) {
      const signature = SIGNATURES.get(method)
      if (!signature) continue
      calls.push({ to: normalizeAddress(rule.address) as Address, signature })
      methods.push(`${rule.label} · ${method}`)
    }
  }

  // Swapping an ERC-20 needs an allowance on the router first. Scoped to `approve` on
  // any token, because the token contract varies per swap — the router it can approve
  // is what actually bounds this, and that is fixed by the allowlist above.
  const router = PANCAKE_V3_ROUTER[input.chainId]
  if (router && granted.has('execute_trades')) {
    const signature = SIGNATURES.get('approve')
    if (signature) {
      calls.push({ signature })
      methods.push('ERC-20 · approve (PancakeSwap router only)')
    }
  }

  const spend: SpendPermission[] = []
  if (input.spendingLimit && input.spendingLimit > 0) {
    spend.push({ limit: parseUnits(String(input.spendingLimit), 18), period: periodFor(input.expiresAt) })
  }

  return { permissions: { calls, spend }, protocols, methods }
}
