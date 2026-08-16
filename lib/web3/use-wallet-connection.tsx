'use client'

import { useEffect, useState } from 'react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { clearSelectedEip6963Provider, discoverEip6963Wallets, selectEip6963Provider, type Eip6963Wallet } from '@/lib/web3/eip6963'

export function useWalletConnection() {
  const account = useAccount()
  const { connect, connectors, isPending, error: connectionError } = useConnect()
  const { disconnect } = useDisconnect()
  const [chooserOpen, setChooserOpen] = useState(false)
  const [wallets, setWallets] = useState<Eip6963Wallet[]>([])
  const [selectedWallet, setSelectedWallet] = useState<Eip6963Wallet | null>(null)
  const injectedConnector = connectors.find((candidate) => candidate.id === 'injected')
  const walletConnectConnector = connectors.find((candidate) => candidate.id === 'walletConnect')

  useEffect(() => {
    if (account.address) window.dispatchEvent(new CustomEvent('kymera:wallet-connected', { detail: { address: account.address } }))
  }, [account.address])

  useEffect(() => {
    const cleanup = discoverEip6963Wallets((wallet) => setWallets((current) => current.some((item) => item.info.uuid === wallet.info.uuid) ? current : [...current, wallet]))
    return cleanup
  }, [])

  function openWalletChooser() {
    setChooserOpen(true)
  }

  function chooseWallet(wallet: Eip6963Wallet) {
    selectEip6963Provider(wallet.provider)
    setSelectedWallet(wallet)
    setChooserOpen(false)
    if (injectedConnector) connect({ connector: injectedConnector })
  }

  function connectWalletConnect() {
    if (walletConnectConnector) connect({ connector: walletConnectConnector })
  }

  function disconnectWallet() {
    clearSelectedEip6963Provider()
    setSelectedWallet(null)
    setChooserOpen(false)
    disconnect()
  }

  return {
    ...account,
    connect,
    connectors,
    injectedConnector,
    walletConnectConnector,
    isPending,
    connectionError,
    chooserOpen,
    setChooserOpen,
    wallets,
    selectedWallet,
    openWalletChooser,
    chooseWallet,
    connectWalletConnect,
    disconnectWallet,
  }
}

export function WalletChooser({ connection }: { connection: ReturnType<typeof useWalletConnection> }) {
  if (!connection.chooserOpen) return null

  return <div className="mt-4 border border-stone-200 bg-stone-50 p-4">
    <div className="flex items-center justify-between"><p className="font-mono text-xs uppercase tracking-wider text-stone-700">Connect wallet</p><button type="button" onClick={() => connection.setChooserOpen(false)} className="text-xs text-stone-500 underline">Close</button></div>
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {connection.wallets.map((wallet) => <button key={wallet.info.uuid} type="button" disabled={connection.isPending} onClick={() => connection.chooseWallet(wallet)} className="flex items-center gap-3 border border-stone-300 bg-white px-3 py-3 text-left text-sm text-stone-800 disabled:opacity-50"><img src={wallet.info.icon} alt="" className="size-7 rounded-md" /><span><strong>{wallet.info.name}</strong><span className="mt-1 block text-xs text-stone-500">Select this wallet</span></span></button>)}
      {connection.wallets.length === 0 && <p className="border border-dashed border-stone-300 px-3 py-3 text-xs text-stone-500">No EIP-6963 wallets announced yet. Install a compatible wallet or use WalletConnect.</p>}
      <button type="button" disabled={!connection.walletConnectConnector || connection.isPending} onClick={connection.connectWalletConnect} className="border border-stone-300 bg-white px-3 py-3 text-left text-sm text-stone-800 disabled:opacity-50"><strong>WalletConnect</strong><span className="mt-1 block text-xs text-stone-500">{connection.walletConnectConnector ? 'Mobile or desktop wallet' : 'Unavailable — configuration required'}</span></button>
    </div>
  </div>
}
