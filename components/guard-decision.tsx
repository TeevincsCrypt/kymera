'use client'

import { Check, Loader2, Minus, ShieldAlert, ShieldCheck, X } from 'lucide-react'
import type { GuardDecisionPayload, GuardFlowState } from '@/lib/web3/use-guard-execution'

const STATE_COPY: Record<GuardFlowState, { label: string; tone: 'neutral' | 'good' | 'bad' | 'busy' }> = {
  idle: { label: 'Ready', tone: 'neutral' },
  authorizing: { label: 'Guard is checking this action…', tone: 'busy' },
  rejected: { label: 'Blocked by Kymera Guard', tone: 'bad' },
  awaiting_signature: { label: 'Approved — confirm in your wallet', tone: 'busy' },
  submitted: { label: 'Submitted to the network', tone: 'busy' },
  confirming: { label: 'Waiting for confirmation…', tone: 'busy' },
  confirmed: { label: 'Confirmed on-chain', tone: 'good' },
  failed: { label: 'Transaction did not complete', tone: 'bad' },
}

function CheckIcon({ status }: { status: 'passed' | 'failed' | 'not_evaluated' }) {
  if (status === 'passed') return <Check size={13} className="mt-0.5 shrink-0 text-[#138a61]" aria-hidden />
  if (status === 'failed') return <X size={13} className="mt-0.5 shrink-0 text-destructive" aria-hidden />
  return <Minus size={13} className="mt-0.5 shrink-0 text-muted-foreground/50" aria-hidden />
}

/**
 * Renders the Guard's decision, check by check. When Guard blocks an action this is
 * the whole explanation the user gets, so it names the specific rule that stopped it
 * rather than showing a generic failure.
 */
export function GuardDecisionPanel({
  decision,
  state,
  txHash,
  error,
  explorerBase = 'https://testnet.bscscan.com',
}: {
  decision: GuardDecisionPayload | null
  state: GuardFlowState
  txHash?: string
  error?: string
  explorerBase?: string
}) {
  if (state === 'idle' && !decision) return null
  const copy = STATE_COPY[state]
  const blocked = state === 'rejected'

  return (
    <div
      className={`mt-4 rounded-xl border p-4 ${
        blocked ? 'border-destructive/30 bg-destructive/5'
        : state === 'confirmed' ? 'border-[#138a61]/30 bg-[#138a61]/5'
        : 'border-border bg-muted/40'
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2">
        {blocked ? <ShieldAlert size={16} className="mt-0.5 shrink-0 text-destructive" aria-hidden />
          : copy.tone === 'busy' ? <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
          : <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[#138a61]" aria-hidden />}
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${blocked ? 'text-destructive' : ''}`}>{copy.label}</p>
          {decision?.message && <p className="mt-1 text-xs leading-5 text-muted-foreground">{decision.message}</p>}
          {blocked && decision?.reason && (
            <p className="mt-2 inline-flex rounded-md bg-destructive/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-destructive">{decision.reason}</p>
          )}
          {error && !blocked && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
      </div>

      {decision?.checks?.length ? (
        <ul className="mt-3 flex flex-col gap-1.5 border-t border-border/60 pt-3">
          {decision.checks.map((check) => (
            <li key={check.id} className="flex items-start gap-2 text-xs">
              <CheckIcon status={check.status} />
              <span className={check.status === 'failed' ? 'font-medium text-destructive' : check.status === 'not_evaluated' ? 'text-muted-foreground/60' : 'text-muted-foreground'}>
                {check.label}
                {check.detail ? <span className="text-muted-foreground/70"> — {check.detail}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {decision?.transaction && !blocked && (
        <div className="mt-3 rounded-lg bg-background/70 p-3 font-mono text-[11px] leading-5 text-muted-foreground">
          <p className="break-all"><span className="text-foreground">To</span> {decision.transaction.to}</p>
          <p><span className="text-foreground">Method</span> {decision.transaction.method}</p>
          <p><span className="text-foreground">Value</span> {decision.transaction.value} wei</p>
          {decision.simulation?.amountOut && <p><span className="text-foreground">Simulated output</span> {decision.simulation.amountOut} base units</p>}
          <p className="mt-1 text-muted-foreground/70">Kymera built this calldata. Your wallet is asked to sign exactly these bytes.</p>
        </div>
      )}

      {txHash && (
        <p className="mt-3 break-all text-xs">
          <a className="font-medium text-primary underline underline-offset-2" href={`${explorerBase}/tx/${txHash}`} target="_blank" rel="noreferrer">
            View transaction on BscScan
          </a>
        </p>
      )}
    </div>
  )
}
