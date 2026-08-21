'use client'

import { useCallback, useState } from 'react'
import { usePublicClient, useWalletClient } from 'wagmi'
import { bsc, bscTestnet } from 'wagmi/chains'
import type { Address, Hex } from 'viem'

/**
 * The single client-side execution path in Kymera.
 *
 * THE INVARIANT THIS ENFORCES: the wallet is only ever asked to sign calldata that
 * the server returned from `/api/guard/authorize`. If Guard rejects, this hook
 * returns before `walletClient` is touched, so no wallet prompt appears. The client
 * never builds transaction data itself — it cannot, because it is not given the
 * means to.
 *
 * Every execution surface (PancakeSwap, ERC-8183, anything added later) must go
 * through `authorizeAndSign`.
 */

export type GuardCheck = { id: string; label: string; status: 'passed' | 'failed' | 'not_evaluated'; detail?: string }

export type GuardDecisionPayload = {
  allowed: boolean
  reason: string
  message: string
  checks: GuardCheck[]
  metadata?: Record<string, unknown>
  executionId: string | null
  transaction: { chainId: number; to: Address; data: Hex; value: string; method: string; summary: string; txDataHash: string } | null
  simulation?: { attempted: boolean; ok: boolean; detail?: string; amountOut?: string } | null
}

export type GuardFlowState =
  | 'idle'
  | 'authorizing'
  | 'rejected'
  | 'awaiting_signature'
  | 'submitted'
  | 'confirming'
  | 'confirmed'
  | 'failed'

export type AuthorizeRequest = {
  action: 'create_job' | 'approve_token' | 'swap'
  chainId: number
  sessionId?: string
  agentId?: string
  token?: string
  tokenOut?: string
  decimals?: number
  amount?: string
  slippageBps?: number
  feeTier?: number
  description?: string
  provider?: string
}

export type GuardFlowResult =
  | { ok: true; txHash: string; confirmed: boolean; decision: GuardDecisionPayload }
  | { ok: false; decision: GuardDecisionPayload | null; error: string }

function chainFor(chainId: number) {
  return chainId === bsc.id ? bsc : bscTestnet
}

export function useGuardExecution() {
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const [state, setState] = useState<GuardFlowState>('idle')
  const [decision, setDecision] = useState<GuardDecisionPayload | null>(null)
  const [txHash, setTxHash] = useState<string>('')
  const [error, setError] = useState<string>('')

  const reset = useCallback(() => {
    setState('idle'); setDecision(null); setTxHash(''); setError('')
  }, [])

  const authorizeAndSign = useCallback(async (request: AuthorizeRequest): Promise<GuardFlowResult> => {
    setError(''); setTxHash(''); setDecision(null); setState('authorizing')

    // ---- Step 1: ask Guard. Nothing touches the wallet before this resolves. ----
    let payload: GuardDecisionPayload
    try {
      const response = await fetch('/api/guard/authorize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...request, walletChainId: request.chainId }),
      })
      payload = await response.json() as GuardDecisionPayload
    } catch {
      setState('failed'); setError('Could not reach Kymera Guard. No transaction was prepared.')
      return { ok: false, decision: null, error: 'GUARD_UNREACHABLE' }
    }

    setDecision(payload)

    // ---- Guard said no. Stop here. The wallet is never opened. ----
    if (!payload.allowed || !payload.transaction || !payload.executionId) {
      setState('rejected')
      return { ok: false, decision: payload, error: payload.reason }
    }

    if (!walletClient) {
      setState('failed'); setError('Connect a wallet to sign the authorized transaction.')
      return { ok: false, decision: payload, error: 'WALLET_UNAVAILABLE' }
    }

    // ---- Step 2: sign exactly what Guard authorized, byte for byte. ----
    const authorized = payload.transaction
    let hash: string
    setState('awaiting_signature')
    try {
      hash = await walletClient.sendTransaction({
        account: walletClient.account,
        chain: chainFor(authorized.chainId),
        to: authorized.to,
        data: authorized.data,
        value: BigInt(authorized.value || '0'),
      })
      setTxHash(hash)
      setState('submitted')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Transaction rejected'
      const userRejected = /reject|denied|cancel/i.test(message)
      setError(userRejected ? 'You declined the transaction in your wallet.' : message.split('\n')[0])
      setState('failed')
      // Release the spending-cap headroom this authorization was holding.
      await fetch('/api/guard/receipt', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ executionId: payload.executionId, stage: 'cancelled' }),
      }).catch(() => undefined)
      return { ok: false, decision: payload, error: userRejected ? 'USER_REJECTED' : 'SIGNATURE_FAILED' }
    }

    await fetch('/api/guard/receipt', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ executionId: payload.executionId, stage: 'submitted', txHash: hash }),
    }).catch(() => undefined)

    // ---- Step 3: wait for the receipt and record the outcome. ----
    setState('confirming')
    try {
      if (!publicClient) throw new Error('NO_PUBLIC_CLIENT')
      const receipt = await publicClient.waitForTransactionReceipt({ hash: hash as Hex })
      const success = receipt.status === 'success'
      await fetch('/api/guard/receipt', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          executionId: payload.executionId,
          stage: success ? 'confirmed' : 'failed',
          blockNumber: receipt.blockNumber?.toString(),
          gasUsed: receipt.gasUsed?.toString(),
          effectiveGasPrice: receipt.effectiveGasPrice?.toString(),
          error: success ? undefined : 'TRANSACTION_REVERTED',
        }),
      }).catch(() => undefined)
      setState(success ? 'confirmed' : 'failed')
      if (!success) setError('The transaction was mined but reverted on-chain.')
      return { ok: success, txHash: hash, confirmed: success, decision: payload } as GuardFlowResult
    } catch {
      // Submitted but we lost the receipt watch; the ledger still shows SUBMITTED.
      setState('submitted')
      return { ok: true, txHash: hash, confirmed: false, decision: payload }
    }
  }, [walletClient, publicClient])

  return { state, decision, txHash, error, authorizeAndSign, reset }
}
