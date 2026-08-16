'use client'

import { useState } from 'react'
import { usePublicClient, useSwitchChain, useWalletClient } from 'wagmi'
import { bsc, kymeraChain, getChainStatus } from '@/lib/web3/config'
import { useWalletConnection, WalletChooser } from '@/lib/web3/use-wallet-connection'
import { estimateJobTransaction, prepareJobTransaction, submitJobTransaction, waitForJobConfirmation } from '@/lib/erc8183/transactions'

export function TestnetWalletGuard() {
  const connection = useWalletConnection()
  const { address, chainId, isConnected, status: accountStatus, connector: activeConnector, isPending, connectionError, chooserOpen, openWalletChooser, disconnectWallet } = connection
  const { switchChain, isPending: switching } = useSwitchChain()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof estimateJobTransaction>> | null>(null)
  const [state, setState] = useState('IDLE')
  const [error, setError] = useState('')
  const [hash, setHash] = useState('')
  const status = getChainStatus(chainId)

  async function prepare() {
    setError(''); setHash('')
    try {
      if (!address || !walletClient || !publicClient) throw new Error('WALLET_REQUIRED')
      if (chainId !== kymeraChain.id) throw new Error(chainId === bsc.id ? 'MAINNET_EXECUTION_DISABLED' : 'WRONG_NETWORK')
      const tx = prepareJobTransaction({ from: address, provider: address })
      const response = await fetch('/api/erc8183/preflight', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wallet: address, chainId, to: tx.to, method: tx.method, value: '0' }) })
      const result = await response.json() as { ok?: boolean; error?: string }
      if (!response.ok || !result.ok) throw new Error(result.error ?? 'GUARD_REJECTED')
      setPreview(await estimateJobTransaction(publicClient, tx)); setState('PREVIEW')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'GUARD_UNAVAILABLE'); setState('BLOCKED') }
  }

  async function signAndSubmit() {
    if (!preview || !walletClient || !publicClient || !address) return
    try {
      setState('SUBMITTED'); const transactionHash = await submitJobTransaction(walletClient, preview); setHash(transactionHash)
      await fetch('/api/erc8183/receipt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ txHash: transactionHash, chainId: kymeraChain.id, from: address, to: preview.to, value: '0', status: 'SUBMITTED' }) })
      setState('CONFIRMING'); const receipt = await waitForJobConfirmation(publicClient, transactionHash); const confirmed = receipt.status === 'success'
      await fetch('/api/erc8183/receipt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ txHash: transactionHash, chainId: kymeraChain.id, from: address, to: preview.to, value: '0', status: confirmed ? 'CONFIRMED' : 'FAILED', blockNumber: receipt.blockNumber.toString(), gasUsed: receipt.gasUsed.toString(), effectiveGasPrice: receipt.effectiveGasPrice?.toString(), error: confirmed ? undefined : 'TRANSACTION_REVERTED' }) })
      setState(confirmed ? 'CONFIRMED' : 'FAILED')
    } catch (cause) { const message = cause instanceof Error ? cause.message : 'TRANSACTION_FAILED'; setError(message.toLowerCase().includes('reject') ? 'USER_REJECTED' : message); setState('FAILED') }
  }

  const connected = Boolean(isConnected && address)
  return <section className="border border-stone-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-500">Universal EVM wallet</p><h2 className="mt-2 text-xl font-semibold text-stone-950">Testnet transaction gate</h2><p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">Connect any compatible EVM wallet. Real execution is restricted to BNB Smart Chain Testnet (chain 97).</p></div><span className={`font-mono text-[10px] uppercase tracking-widest ${status.correctNetwork ? 'text-emerald-700' : 'text-amber-700'}`}>{status.correctNetwork ? 'Connected' : connected && chainId === bsc.id ? 'Mainnet disabled' : 'Network locked'}</span></div>
    <div className="mt-5 flex flex-wrap items-center gap-3">{!connected ? <button type="button" onClick={openWalletChooser} disabled={isPending} className="bg-stone-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{isPending ? 'CONNECTING...' : 'Connect wallet'}</button> : <><span className="border border-stone-200 px-3 py-2 font-mono text-xs text-stone-700">{address.slice(0, 6)}…{address.slice(-4)}</span>{chainId !== kymeraChain.id && <button type="button" onClick={() => switchChain({ chainId: kymeraChain.id })} disabled={switching} className="border border-amber-300 px-4 py-2 text-sm font-medium text-amber-800">{switching ? 'Switching...' : 'Switch to testnet'}</button>}<button type="button" onClick={prepare} disabled={!status.correctNetwork || state === 'CONFIRMING' || state === 'SUBMITTED'} className="bg-stone-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Run Guard & preview</button><button type="button" onClick={() => { disconnectWallet(); setPreview(null); setHash(''); setState('IDLE') }} className="text-sm text-stone-500 underline">Disconnect wallet</button></>}</div>
    <WalletChooser connection={connection} />
    {preview && <div className="mt-5 border border-stone-200 bg-stone-50 p-4 font-mono text-xs text-stone-700"><p>Network: BNB Smart Chain Testnet (97)</p><p>From: {preview.from}</p><p>To: {preview.to}</p><p>Method: createJob(...)</p><p>Value: 0 BNB</p><p>Gas estimate: {preview.estimatedGas?.toString()}</p><p>Guard status: APPROVED</p><button type="button" onClick={signAndSubmit} className="mt-4 bg-emerald-700 px-4 py-2 font-sans text-sm font-medium text-white">Sign in wallet</button></div>}
    {process.env.NODE_ENV === 'development' && <div className="mt-4 border-t border-dashed border-stone-200 pt-3 font-mono text-[10px] uppercase tracking-wider text-stone-500"><p>Wallet status: {accountStatus}</p><p>Connector: {activeConnector?.name ?? 'none'}</p><p>Selected wallet: {connection.selectedWallet?.info.name ?? 'none'}</p><p>Account: {address ?? 'none'}</p><p>Chain ID: {chainId ?? 'none'}</p><p>Available injected wallets: {connection.wallets.map((wallet) => wallet.info.name).join(', ') || 'none'}</p><p>Provider count: {connection.wallets.length}</p><p>Auto reconnect: disabled</p><p>Connection error: {connectionError?.message ?? 'none'}</p></div>}{state !== 'IDLE' && <p className="mt-4 text-sm text-stone-600">State: <strong>{state}</strong></p>}{error && <p className="mt-2 text-sm text-red-700">{error}</p>}{hash && <p className="mt-2 text-sm text-emerald-700">Transaction {state === 'CONFIRMED' ? 'confirmed' : 'submitted'}: <a className="underline" href={`https://testnet.bscscan.com/tx/${hash}`} target="_blank" rel="noreferrer">{hash}</a></p>}
  </section>
}
