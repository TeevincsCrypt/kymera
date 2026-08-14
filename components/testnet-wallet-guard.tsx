'use client'

import { useEffect, useState } from 'react'
import { useAccount, useConnect, useDisconnect, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi'
import { kymeraChain, getChainStatus } from '@/lib/web3/config'
import { estimateJobTransaction, prepareJobTransaction, submitJobTransaction, waitForJobConfirmation } from '@/lib/erc8183/transactions'

export function TestnetWalletGuard() {
  const { address, chainId, isConnected, status: accountStatus } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const [providerDetected, setProviderDetected] = useState(false)
  const [availableConnector, setAvailableConnector] = useState('none')
  const { switchChain, isPending: switching } = useSwitchChain()
  const { disconnect } = useDisconnect()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof estimateJobTransaction>> | null>(null)
  const [state, setState] = useState('IDLE')
  const [error, setError] = useState('')
  const [hash, setHash] = useState('')
  const status = getChainStatus(chainId)
  const connector = connectors.find((candidate) => candidate.id === 'injected')

  useEffect(() => {
    const ethereum = (window as Window & { ethereum?: { isRabby?: boolean; providers?: Array<{ isRabby?: boolean }> } }).ethereum
    const rabby = Boolean(ethereum?.isRabby || ethereum?.providers?.some((candidate) => candidate.isRabby))
    setProviderDetected(rabby)
    setAvailableConnector(connector?.name ?? 'none')
  }, [connector?.name])

  async function prepare() {
    setError(''); setHash('')
    try {
      if (!address || !walletClient || !publicClient) throw new Error('WALLET_REQUIRED')
      if (chainId !== 97) throw new Error('WRONG_NETWORK')
      const tx = prepareJobTransaction({ from: address, provider: address })
      const preflight = await fetch('/api/erc8183/preflight', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wallet: address, chainId, to: tx.to, method: tx.method, value: '0' }) })
      const result = await preflight.json() as { ok?: boolean; error?: string }
      if (!preflight.ok || !result.ok) throw new Error(result.error ?? 'GUARD_REJECTED')
      setPreview(await estimateJobTransaction(publicClient, tx)); setState('PREVIEW')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'GUARD_UNAVAILABLE'); setState('BLOCKED') }
  }

  async function signAndSubmit() {
    if (!preview || !walletClient || !publicClient || !address) return
    try {
      setState('SUBMITTED'); const transactionHash = await submitJobTransaction(walletClient, preview); setHash(transactionHash)
      await fetch('/api/erc8183/receipt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ txHash: transactionHash, chainId: 97, from: address, to: preview.to, value: '0', status: 'SUBMITTED' }) })
      setState('CONFIRMING'); const receipt = await waitForJobConfirmation(publicClient, transactionHash)
      const confirmed = receipt.status === 'success'
      await fetch('/api/erc8183/receipt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ txHash: transactionHash, chainId: 97, from: address, to: preview.to, value: '0', status: confirmed ? 'CONFIRMED' : 'FAILED', blockNumber: receipt.blockNumber.toString(), gasUsed: receipt.gasUsed.toString(), effectiveGasPrice: receipt.effectiveGasPrice?.toString(), error: confirmed ? undefined : 'TRANSACTION_REVERTED' }) })
      setState(confirmed ? 'CONFIRMED' : 'FAILED')
    } catch (cause) { const message = cause instanceof Error ? cause.message : 'TRANSACTION_FAILED'; setError(message.toLowerCase().includes('reject') ? 'USER_REJECTED' : message); setState('FAILED') }
  }

  return <section className="border border-stone-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-500">Browser wallet</p><h2 className="mt-2 text-xl font-semibold text-stone-950">Testnet transaction gate</h2><p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">Rabby or another injected EVM wallet may connect. Kymera accepts only BNB Smart Chain Testnet (chain 97).</p></div><span className={`font-mono text-[10px] uppercase tracking-widest ${status.correctNetwork ? 'text-emerald-700' : 'text-amber-700'}`}>{status.correctNetwork ? 'Chain verified' : 'Simulation locked'}</span></div>
    <div className="mt-5 flex flex-wrap items-center gap-3">{!isConnected || !address ? <button type="button" onClick={() => { if (connector) connect({ connector }) }} disabled={!connector || isPending} className="bg-stone-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{isPending ? 'CONNECTING...' : connector ? 'Connect Rabby' : 'Rabby not detected'}</button> : <><span className="border border-stone-200 px-3 py-2 font-mono text-xs text-stone-700">{address?.slice(0, 6)}…{address?.slice(-4)}</span>{!status.correctNetwork && <button type="button" onClick={() => switchChain({ chainId: kymeraChain.id })} disabled={switching} className="border border-amber-300 px-4 py-2 text-sm font-medium text-amber-800">{switching ? 'Switching…' : 'Switch to testnet'}</button>}<button type="button" onClick={prepare} disabled={!status.correctNetwork || state === 'CONFIRMING' || state === 'SUBMITTED'} className="bg-stone-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Run Guard & preview</button><button type="button" onClick={() => disconnect()} className="text-sm text-stone-500 underline">Disconnect</button></>}</div>
    {preview && <div className="mt-5 border border-stone-200 bg-stone-50 p-4 font-mono text-xs text-stone-700"><p>Network: BNB Smart Chain Testnet (97)</p><p>From: {preview.from}</p><p>To: {preview.to}</p><p>Method: createJob(...)</p><p>Value: 0 BNB</p><p>Gas estimate: {preview.estimatedGas?.toString()}</p><p>Guard status: APPROVED</p><button type="button" onClick={signAndSubmit} className="mt-4 bg-emerald-700 px-4 py-2 font-sans text-sm font-medium text-white">Sign in wallet</button></div>}
    {process.env.NODE_ENV === 'development' && <div className="mt-4 border-t border-dashed border-stone-200 pt-3 font-mono text-[10px] uppercase tracking-wider text-stone-500"><p>Wallet provider detected: {providerDetected ? 'yes' : 'no'}</p><p>Connector: {availableConnector}</p><p>Account: {accountStatus === 'connected' && address ? address : 'none'}</p><p>Chain: {chainId ?? 'none'}</p></div>}{state !== 'IDLE' && <p className="mt-4 text-sm text-stone-600">State: <strong>{state}</strong></p>}{error && <p className="mt-2 text-sm text-red-700">{error}</p>}{hash && <p className="mt-2 text-sm text-emerald-700">Transaction {state === 'CONFIRMED' ? 'confirmed' : 'submitted'}: <a className="underline" href={`https://testnet.bscscan.com/tx/${hash}`} target="_blank" rel="noreferrer">{hash}</a></p>}
  </section>
}
