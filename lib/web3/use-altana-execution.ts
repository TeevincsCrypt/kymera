'use client'

import { useCallback, useState } from 'react'
import type { AuthorizeRequest, GuardDecisionPayload, GuardFlowState } from '@/lib/web3/use-guard-execution'

/**
 * Autonomous execution through an agent's Altana session key.
 *
 * The counterpart to useGuardExecution: same Guard decision, same calldata, but the
 * agent wallet submits it instead of the user's wallet. No wallet prompt ever opens,
 * because the user's wallet is not a signer on this path — the authority is the
 * on-chain session grant they made earlier, and Guard still decides first.
 */
export type AltanaFlowResult =
  | { ok: true; txHash?: string; explorerUrl?: string; status: string }
  | { ok: false; blocked: boolean; reason?: string }

export function useAltanaExecution() {
  const [state, setState] = useState<GuardFlowState>('idle')
  const [decision, setDecision] = useState<GuardDecisionPayload | null>(null)
  const [txHash, setTxHash] = useState<string>()
  const [explorerUrl, setExplorerUrl] = useState<string>()
  const [error, setError] = useState<string>()

  const reset = useCallback(() => {
    setState('idle'); setDecision(null); setTxHash(undefined); setExplorerUrl(undefined); setError(undefined)
  }, [])

  const execute = useCallback(async (request: AuthorizeRequest): Promise<AltanaFlowResult> => {
    reset()
    setState('authorizing')
    try {
      const response = await fetch('/api/altana/execute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      })
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>
      const guardDecision = (payload.decision ?? null) as GuardDecisionPayload | null
      setDecision(guardDecision)

      if (payload.blocked) {
        setState('rejected')
        return { ok: false, blocked: true, reason: guardDecision?.reason }
      }
      if (!response.ok || !payload.executed) {
        const message = typeof payload.error === 'string' ? payload.error : 'The agent wallet could not submit this action.'
        setError(typeof payload.detail === 'string' ? `${message} (${payload.detail})` : message)
        setState('failed')
        return { ok: false, blocked: false, reason: typeof payload.code === 'string' ? payload.code : undefined }
      }

      const hash = typeof payload.txHash === 'string' ? payload.txHash : undefined
      const url = typeof payload.explorerUrl === 'string' ? payload.explorerUrl : undefined
      const status = typeof payload.status === 'string' ? payload.status : 'PENDING'
      setTxHash(hash)
      setExplorerUrl(url)
      // PENDING means the relay accepted it but has not reported a receipt yet — shown
      // as still confirming rather than as a completed transaction.
      setState(status === 'CONFIRMED' ? 'confirmed' : status === 'FAILED' ? 'failed' : 'confirming')
      return { ok: true, txHash: hash, explorerUrl: url, status }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The agent wallet could not submit this action.')
      setState('failed')
      return { ok: false, blocked: false }
    }
  }, [reset])

  return { state, decision, txHash, explorerUrl, error, execute, reset }
}
