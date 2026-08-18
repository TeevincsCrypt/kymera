'use client'

import { useState } from 'react'
import { useWalletConnection } from '@/lib/web3/use-wallet-connection'

export function ExecutionControlPanel() {
  const [result, setResult] = useState<{ status?: string; txHash?: string; error?: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const { address } = useWalletConnection()
  async function run() {
    if (!address) { setResult({ error: 'Connect your wallet before submitting a real transaction.' }); return }
    setLoading(true); setResult(null)
    try {
      const response = await fetch('/api/kymera/execute', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userAddress: address, action: { action: 'wallet_signed_transaction' } }) })
      setResult(await response.json())
    } catch (error) { setResult({ error: error instanceof Error ? error.message : 'Execution request failed' }) } finally { setLoading(false) }
  }
  return <section className="rounded-2xl border border-border bg-card p-5"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Control plane</p><h2 className="mt-2 text-xl font-semibold tracking-[-.03em]">Wallet execution</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Real transactions require an active Guard session, a supported network, simulation, and explicit wallet confirmation.</p></div>{!address && <p className="mt-4 text-sm text-muted-foreground">Connect your wallet to submit a transaction.</p>}<button disabled={loading || !address} onClick={run} className="mt-5 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{loading ? 'Submitting…' : 'Review wallet execution'}</button>{result && <div className="mt-5 rounded-xl bg-muted p-4 text-sm">{result.error ? <p className="text-destructive">{result.error}</p> : <p>{result.status || 'Execution request submitted'}{result.txHash ? ` · ${result.txHash}` : ''}</p>}</div>}</section>
}
