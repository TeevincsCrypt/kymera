'use client'

import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi'
import { kymeraChain, getChainStatus } from '@/lib/web3/config'

export function TestnetWalletGuard() {
  const { address, chainId, isConnected } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { switchChain, isPending: switching } = useSwitchChain()
  const { disconnect } = useDisconnect()
  const status = getChainStatus(chainId)
  const connector = connectors[0]

  return <section className="border border-stone-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-4">
      <div><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-500">Browser wallet</p><h2 className="mt-2 text-xl font-semibold text-stone-950">Testnet transaction gate</h2><p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">Rabby or another injected EVM wallet may connect. Kymera accepts only BNB Smart Chain Testnet (chain 97).</p></div>
      <span className={`font-mono text-[10px] uppercase tracking-widest ${status.correctNetwork ? 'text-emerald-700' : 'text-amber-700'}`}>{status.correctNetwork ? 'Chain verified' : 'Simulation locked'}</span>
    </div>
    <div className="mt-5 flex flex-wrap items-center gap-3">
      {!isConnected ? <button type="button" onClick={() => connector && connect({ connector })} disabled={!connector || isPending} className="bg-stone-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{isPending ? 'Connecting…' : 'Connect wallet'}</button> : <><span className="border border-stone-200 px-3 py-2 font-mono text-xs text-stone-700">{address?.slice(0, 6)}…{address?.slice(-4)}</span>{!status.correctNetwork && <button type="button" onClick={() => switchChain({ chainId: kymeraChain.id })} disabled={switching} className="border border-amber-300 px-4 py-2 text-sm font-medium text-amber-800">{switching ? 'Switching…' : 'Switch to testnet'}</button>}<button type="button" onClick={() => disconnect()} className="text-sm text-stone-500 underline">Disconnect</button></>}
    </div>
  </section>
}
