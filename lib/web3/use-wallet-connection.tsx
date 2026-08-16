'use client'

import { useEffect, useState } from 'react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'

export function useWalletConnection() {
  const account = useAccount()
  const { connect, connectors, isPending, error: connectionError } = useConnect()
  const { disconnect } = useDisconnect()
  const [chooserOpen, setChooserOpen] = useState(false)
  const walletConnectConnector = connectors.find((candidate) => candidate.id === 'walletConnect')
  const wallets = connectors.filter((candidate) => candidate.id !== 'walletConnect')
  const selectedWallet = account.connector

  useEffect(() => {
    if (account.address) window.dispatchEvent(new CustomEvent('kymera:wallet-connected', { detail: { address: account.address } }))
  }, [account.address])

  function openWalletChooser() {
    setChooserOpen(true)
  }

  function chooseWallet(wallet: typeof connectors[number]) {
    setChooserOpen(false)
    connect({ connector: wallet })
  }

  function connectWalletConnect() {
    if (walletConnectConnector) connect({ connector: walletConnectConnector })
  }

  function disconnectWallet() {
    setChooserOpen(false)
    disconnect()
  }

  return {
    ...account,
    connect,
    connectors,
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
      {connection.wallets.map((wallet) => <button key={wallet.uid} type="button" disabled={connection.isPending} onClick={() => connection.chooseWallet(wallet)} className="flex items-center gap-3 border border-stone-300 bg-white px-3 py-3 text-left text-sm text-stone-800 disabled:opacity-50"><span className="flex size-7 items-center justify-center rounded-md bg-stone-200 font-mono text-xs text-stone-700">{wallet.name.slice(0, 1)}</span><span><strong>{wallet.name}</strong><span className="mt-1 block text-xs text-stone-500">Select this wallet</span></span></button>)}
      {connection.wallets.length === 0 && <p className="border border-dashed border-stone-300 px-3 py-3 text-xs text-stone-500">No EIP-6963 wallets announced yet. Install a compatible wallet or use WalletConnect.</p>}
      <button type="button" disabled={!connection.walletConnectConnector || connection.isPending} onClick={connection.connectWalletConnect} className="border border-stone-300 bg-white px-3 py-3 text-left text-sm text-stone-800 disabled:opacity-50"><strong>WalletConnect</strong><span className="mt-1 block text-xs text-stone-500">{connection.walletConnectConnector ? 'Mobile or desktop wallet' : 'Unavailable — configuration required'}</span></button>
    </div>
  </div>
}
