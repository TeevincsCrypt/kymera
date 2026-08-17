'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
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
  useEffect(() => {
    if (!connection.chooserOpen) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') connection.setChooserOpen(false) }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [connection.chooserOpen, connection.setChooserOpen])
  if (!connection.chooserOpen) return null
  return typeof document !== 'undefined' ? createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="wallet-dialog-title"><button type="button" className="absolute inset-0 bg-foreground/40" onClick={() => connection.setChooserOpen(false)} aria-label="Close wallet dialog" /><div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"><div className="flex items-center justify-between"><div><p id="wallet-dialog-title" className="font-semibold">Connect wallet</p><p className="mt-1 text-sm text-muted-foreground">Connect to Kymera</p></div><button type="button" onClick={() => connection.setChooserOpen(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Close wallet dialog">×</button></div><div className="mt-6 flex flex-col gap-3">{connection.wallets.map((wallet) => <button key={wallet.uid} type="button" disabled={connection.isPending} onClick={() => connection.chooseWallet(wallet)} className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-4 text-left text-sm disabled:opacity-50"><span className="flex size-9 items-center justify-center rounded-lg bg-muted font-mono text-xs">{wallet.name.slice(0, 1)}</span><span><strong>{wallet.name}</strong><span className="mt-1 block text-xs text-muted-foreground">Select this wallet</span></span></button>)}{connection.wallets.length === 0 && <p className="rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">No injected wallets announced. Install a compatible wallet or use WalletConnect.</p>}<button type="button" disabled={!connection.walletConnectConnector || connection.isPending} onClick={connection.connectWalletConnect} className="rounded-xl border border-border bg-background px-4 py-4 text-left text-sm disabled:opacity-50"><strong>WalletConnect</strong><span className="mt-1 block text-xs text-muted-foreground">{connection.walletConnectConnector ? 'Mobile or desktop wallet' : 'Unavailable — configuration required'}</span></button></div><p className="mt-5 text-xs text-muted-foreground">BNB Smart Chain Testnet</p></div></div>, document.body) : null
}
