/**
 * How far an authorization actually got, as one unambiguous state.
 *
 * The activity log must never blur a Guard refusal, an authorization that was never
 * signed, and a real transaction into the same visual bucket — those are the three
 * outcomes the product exists to distinguish, so they are computed here once and used
 * everywhere rather than re-derived per component.
 *
 * There is deliberately no SIMULATED state: the Guard dry-run records nothing at all,
 * so nothing in this ledger is ever a simulation. Anything here was a real request
 * against real limits.
 */

export const SETTLEMENT = {
  /** Guard refused. No calldata was built and nothing was sent. */
  blocked: 'BLOCKED',
  /** Guard approved and reserved headroom; no transaction has been submitted yet. */
  awaiting: 'AWAITING_SIGNATURE',
  /** A transaction exists on chain (submitted, confirmed, or reverted). */
  onchain: 'ON_CHAIN',
  /** Approved but never reached the chain — cancelled, expired, or the submit failed. */
  unsettled: 'NOT_SETTLED',
} as const

export type Settlement = (typeof SETTLEMENT)[keyof typeof SETTLEMENT]

/** Who put the transaction on chain. Null when nothing was submitted. */
export type Submitter = 'USER_WALLET' | 'ALTANA_SESSION' | null

export type SettlementInput = {
  decision: string
  status: string
  txHash: string | null
  metadata: unknown
}

export function settlementOf(execution: SettlementInput): { settlement: Settlement; submittedBy: Submitter } {
  if (execution.decision === 'REJECTED') return { settlement: SETTLEMENT.blocked, submittedBy: null }

  const metadata = (execution.metadata ?? {}) as Record<string, unknown>
  const mode = typeof metadata.executionMode === 'string' ? metadata.executionMode : null

  if (execution.txHash) {
    // An Altana submission is the only path that records its own mode. Everything else
    // reaching the chain did so through the user's own wallet signature.
    return { settlement: SETTLEMENT.onchain, submittedBy: mode === 'ALTANA_SESSION' ? 'ALTANA_SESSION' : 'USER_WALLET' }
  }
  if (execution.status === 'AUTHORIZED') return { settlement: SETTLEMENT.awaiting, submittedBy: null }
  return { settlement: SETTLEMENT.unsettled, submittedBy: null }
}

export const SETTLEMENT_COPY: Record<Settlement, { label: string; detail: string }> = {
  BLOCKED: { label: 'Blocked', detail: 'Guard refused this request. No transaction was built and nothing was sent.' },
  AWAITING_SIGNATURE: { label: 'Awaiting signature', detail: 'Guard authorized this and reserved spending headroom. It has not been submitted.' },
  ON_CHAIN: { label: 'On chain', detail: 'A real transaction was submitted to BNB Chain.' },
  NOT_SETTLED: { label: 'Not settled', detail: 'Authorized, but it never reached the chain. The spending headroom was returned.' },
}

export const SUBMITTER_COPY: Record<NonNullable<Submitter>, string> = {
  USER_WALLET: 'Signed by your wallet',
  ALTANA_SESSION: 'Submitted by the agent wallet via its Altana session key',
}
