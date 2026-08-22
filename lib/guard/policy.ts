/**
 * Kymera Guard — policy definitions.
 *
 * This is the single source of truth for what an agent session is permitted to do.
 * Chains, contracts, methods, and action→permission mappings all live here so that
 * every execution surface reads the same rules. Nothing outside `lib/guard` should
 * define its own allowlist.
 */

export const GUARD_PERMISSIONS = [
  'read_market_data',
  'analyze_positions',
  'execute_trades',
  'move_funds',
  'submit_transactions',
] as const

export type GuardPermission = (typeof GUARD_PERMISSIONS)[number]

/**
 * Permissions that Kymera refuses to grant through the standard session flow.
 * `move_funds` implies unbounded custody of user assets; it requires a dedicated
 * wallet flow that does not exist, so it is rejected at grant time and at
 * evaluation time.
 */
export const BLOCKED_PERMISSIONS: readonly GuardPermission[] = ['move_funds']

/** Deterministic rejection codes. Every Guard denial maps to exactly one of these. */
export const GUARD_REASONS = {
  APPROVED: 'APPROVED',
  WALLET_REQUIRED: 'WALLET_REQUIRED',
  WALLET_INVALID: 'WALLET_INVALID',
  NOT_AUTHENTICATED: 'NOT_AUTHENTICATED',
  WRONG_WALLET: 'WRONG_WALLET',
  AGENT_NOT_FOUND: 'AGENT_NOT_FOUND',
  AGENT_MISMATCH: 'AGENT_MISMATCH',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_REVOKED: 'SESSION_REVOKED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  SESSION_INACTIVE: 'SESSION_INACTIVE',
  CHAIN_NOT_ALLOWED: 'CHAIN_NOT_ALLOWED',
  CHAIN_MISMATCH: 'CHAIN_MISMATCH',
  ACTION_NOT_SUPPORTED: 'ACTION_NOT_SUPPORTED',
  ACTION_NOT_ALLOWED: 'ACTION_NOT_ALLOWED',
  PERMISSION_NOT_GRANTED: 'PERMISSION_NOT_GRANTED',
  PERMISSION_BLOCKED: 'PERMISSION_BLOCKED',
  CONTRACT_NOT_ALLOWLISTED: 'CONTRACT_NOT_ALLOWLISTED',
  METHOD_NOT_ALLOWLISTED: 'METHOD_NOT_ALLOWLISTED',
  SPENDER_NOT_ALLOWLISTED: 'SPENDER_NOT_ALLOWLISTED',
  SPENDING_CAP_EXCEEDED: 'SPENDING_CAP_EXCEEDED',
  SPENDING_CAP_UNSET: 'SPENDING_CAP_UNSET',
  AMOUNT_INVALID: 'AMOUNT_INVALID',
  ADDRESS_INVALID: 'ADDRESS_INVALID',
  SIMULATION_REVERTED: 'SIMULATION_REVERTED',
  TOKEN_NOT_ON_CHAIN: 'TOKEN_NOT_ON_CHAIN',
  GUARD_UNAVAILABLE: 'GUARD_UNAVAILABLE',
} as const

export type GuardReason = (typeof GUARD_REASONS)[keyof typeof GUARD_REASONS]

/** Human-readable explanations shown in the UI next to a rejection. */
export const GUARD_REASON_COPY: Record<GuardReason, string> = {
  APPROVED: 'All Guard checks passed.',
  WALLET_REQUIRED: 'Connect a wallet before requesting an action.',
  WALLET_INVALID: 'The supplied wallet address is not a valid EVM address.',
  NOT_AUTHENTICATED: 'Sign in with your wallet so Kymera can verify you own this address.',
  WRONG_WALLET: 'This Guard session belongs to a different wallet.',
  AGENT_NOT_FOUND: 'The requested agent is not in the Kymera index.',
  AGENT_MISMATCH: 'This Guard session was not issued for the requesting agent.',
  SESSION_NOT_FOUND: 'No Guard session authorizes this action. Grant permissions first.',
  SESSION_REVOKED: 'This Guard session was revoked.',
  SESSION_EXPIRED: 'This Guard session has expired. Grant a new one to continue.',
  SESSION_INACTIVE: 'This Guard session is not active.',
  CHAIN_NOT_ALLOWED: 'Kymera does not permit execution on this network.',
  CHAIN_MISMATCH: 'Your wallet is on a different network than the requested action.',
  ACTION_NOT_SUPPORTED: 'Kymera does not support this action type.',
  ACTION_NOT_ALLOWED: 'This action is not permitted by Kymera policy.',
  PERMISSION_NOT_GRANTED: 'The session does not grant the permission this action requires.',
  PERMISSION_BLOCKED: 'This permission is blocked by Kymera and cannot be granted.',
  CONTRACT_NOT_ALLOWLISTED: 'The target contract is not on the Guard allowlist for this network.',
  METHOD_NOT_ALLOWLISTED: 'The requested contract method is not on the Guard allowlist.',
  SPENDER_NOT_ALLOWLISTED: 'Token approvals are only permitted for allowlisted Kymera routers.',
  SPENDING_CAP_EXCEEDED: 'This action would exceed the spending limit set for this session.',
  SPENDING_CAP_UNSET: 'This session has no spending limit, so value-bearing actions are refused.',
  AMOUNT_INVALID: 'The requested amount is not a valid positive number.',
  ADDRESS_INVALID: 'One of the supplied addresses is malformed.',
  SIMULATION_REVERTED: 'Simulating this transaction on-chain showed it would fail, so Kymera refused to prepare it.',
  TOKEN_NOT_ON_CHAIN: 'This token does not exist on the network you are executing against. Pool analytics are read from BNB mainnet, while execution is on testnet — the same token has a different address there, so this swap cannot be signed.',
  GUARD_UNAVAILABLE: 'Guard could not complete its checks. No transaction was prepared.',
}

/* ------------------------------------------------------------------ chains */

export const BSC_TESTNET_CHAIN_ID = 97
export const BSC_MAINNET_CHAIN_ID = 56

/**
 * Mainnet execution is opt-in and off by default. Kymera ships pointed at BSC
 * testnet so a misconfiguration can never move real funds.
 */
export function mainnetEnabled() {
  return process.env.KYMERA_ENABLE_MAINNET === 'true'
}

export function allowedChainIds(): number[] {
  return mainnetEnabled() ? [BSC_TESTNET_CHAIN_ID, BSC_MAINNET_CHAIN_ID] : [BSC_TESTNET_CHAIN_ID]
}

/* ----------------------------------------------------------------- actions */

export const GUARD_ACTIONS = [
  'create_job',
  'approve_token',
  'swap',
] as const

export type GuardAction = (typeof GUARD_ACTIONS)[number]

export function isGuardAction(value: unknown): value is GuardAction {
  return typeof value === 'string' && (GUARD_ACTIONS as readonly string[]).includes(value)
}

/** Which session permission each on-chain action requires. */
export const ACTION_PERMISSION: Record<GuardAction, GuardPermission> = {
  create_job: 'submit_transactions',
  approve_token: 'execute_trades',
  swap: 'execute_trades',
}

/**
 * Whether the action's amount must be checked against the session spending cap.
 * Both an approval and the swap it enables are bounded by the limit...
 */
export const ACTION_IS_VALUE_BEARING: Record<GuardAction, boolean> = {
  create_job: false,
  approve_token: true,
  swap: true,
}

/**
 * ...but only the settlement action *consumes* headroom. An ERC-20 approval and the
 * swap that spends it are one economic exposure, so counting both would charge the
 * user's limit twice for a single trade. The approval is capped, the swap is counted.
 */
export const ACTION_CONSUMES_CAP: Record<GuardAction, boolean> = {
  create_job: false,
  approve_token: false,
  swap: true,
}

/* --------------------------------------------------------------- contracts */

export const ERC8183_ADDRESSES = {
  agenticCommerce: '0xa206c0517b6371c6638cd9e4a42cc9f02a33b0de',
  evaluatorRouter: '0xd7d36d66d2f1b608a0f943f722d27e3744f66f25',
  optimisticPolicy: '0x4f4678d4439fec812ac7674bb3efb4c8f5fb78a6',
  paymentToken: '0xc70b8741b8b07a6d61e54fd4b20f22fa648e5565',
} as const

export const PANCAKE_V3_ROUTER: Record<number, string> = {
  [BSC_MAINNET_CHAIN_ID]: '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4',
  [BSC_TESTNET_CHAIN_ID]: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
}

type ContractRule = { address: string; methods: string[]; actions: GuardAction[]; label: string }

/**
 * Contract + method allowlist, per chain. A contract that is not listed here can
 * never be called through Kymera, regardless of session permissions.
 */
const CONTRACT_ALLOWLIST: Record<number, ContractRule[]> = {
  [BSC_TESTNET_CHAIN_ID]: [
    {
      address: ERC8183_ADDRESSES.agenticCommerce,
      methods: ['createJob'],
      actions: ['create_job'],
      label: 'ERC-8183 Agentic Commerce',
    },
    {
      address: PANCAKE_V3_ROUTER[BSC_TESTNET_CHAIN_ID],
      methods: ['exactInputSingle'],
      actions: ['swap'],
      label: 'PancakeSwap V3 SmartRouter (testnet)',
    },
  ],
  [BSC_MAINNET_CHAIN_ID]: [
    {
      address: PANCAKE_V3_ROUTER[BSC_MAINNET_CHAIN_ID],
      methods: ['exactInputSingle'],
      actions: ['swap'],
      label: 'PancakeSwap V3 SmartRouter (mainnet)',
    },
  ],
}

export function normalizeAddress(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function isAddress(value: string | null | undefined) {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value.trim())
}

export function contractRuleFor(chainId: number, address: string): ContractRule | null {
  const target = normalizeAddress(address)
  const rules = CONTRACT_ALLOWLIST[chainId] || []
  return rules.find((rule) => normalizeAddress(rule.address) === target) ?? null
}

export function allowlistedContracts(chainId: number) {
  return (CONTRACT_ALLOWLIST[chainId] || []).map((rule) => ({ address: rule.address, label: rule.label, methods: rule.methods }))
}

/**
 * Token approvals target an arbitrary ERC-20, so the address of the token itself
 * cannot be allowlisted. The security property that matters is the *spender*:
 * Kymera only ever lets a user approve a router it already trusts for the action.
 */
export function isAllowlistedSpender(chainId: number, spender: string) {
  const target = normalizeAddress(spender)
  return (CONTRACT_ALLOWLIST[chainId] || []).some((rule) => normalizeAddress(rule.address) === target)
}

/** Methods permitted for the `approve_token` action, on any ERC-20 target. */
export const ERC20_APPROVE_METHOD = 'approve'
