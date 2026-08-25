'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAccount, useConnect, useDisconnect, useSignMessage, useSwitchChain } from 'wagmi'
import { KYMERA_CHAIN_ID, KYMERA_NETWORK_LABEL, getChainStatus } from '@/lib/web3/config'

/**
 * One source of truth for "who is using Kymera right now".
 *
 * There are two distinct facts here and the UI must never conflate them:
 *   connected     — a wallet is attached to the browser.
 *   authenticated — that wallet proved ownership by signing a challenge, so the
 *                   server will act on its behalf.
 *
 * Only the second one grants access to any wallet-scoped data.
 */

type SessionState = {
  address?: `0x${string}`
  isConnected: boolean
  chainId?: number
  chainStatus: ReturnType<typeof getChainStatus>
  authenticatedAddress: string | null
  isAuthenticated: boolean
  /** Connected wallet differs from the signed-in wallet — the user must re-sign. */
  addressMismatch: boolean
  authPending: boolean
  authError: string
  connectPending: boolean
  connectors: ReturnType<typeof useConnect>['connectors']
  wallets: ReturnType<typeof useConnect>['connectors']
  walletConnectConnector?: ReturnType<typeof useConnect>['connectors'][number]
  chooserOpen: boolean
  openWalletChooser: () => void
  closeWalletChooser: () => void
  chooseWallet: (connector: ReturnType<typeof useConnect>['connectors'][number]) => void
  connectWalletConnect: () => void
  disconnectWallet: () => Promise<void>
  signIn: () => Promise<boolean>
  signOut: () => Promise<void>
  switchToKymeraChain: () => void
  switching: boolean
}

const KymeraSessionContext = createContext<SessionState | null>(null)

export function KymeraSessionProvider({ children }: { children: React.ReactNode }) {
  const account = useAccount()
  const { connect, connectors, isPending: connectPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { signMessageAsync } = useSignMessage()
  const { switchChain, isPending: switching } = useSwitchChain()

  const [authenticatedAddress, setAuthenticatedAddress] = useState<string | null>(null)
  const [authPending, setAuthPending] = useState(false)
  const [authError, setAuthError] = useState('')
  const [chooserOpen, setChooserOpen] = useState(false)

  const refreshSession = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/session', { cache: 'no-store' })
      const payload = await response.json() as { authenticated: boolean; address: string | null }
      setAuthenticatedAddress(payload.authenticated ? payload.address : null)
    } catch {
      setAuthenticatedAddress(null)
    }
  }, [])

  useEffect(() => { void refreshSession() }, [refreshSession])

  const signIn = useCallback(async () => {
    if (!account.address) { setAuthError('Connect a wallet first.'); return false }
    setAuthPending(true); setAuthError('')
    try {
      const nonceResponse = await fetch('/api/auth/nonce', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: account.address, chainId: account.chainId ?? KYMERA_CHAIN_ID }),
      })
      const challenge = await nonceResponse.json() as { message?: string; nonce?: string; issuedAt?: string; chainId?: number; error?: string }
      if (!nonceResponse.ok || !challenge.message) throw new Error(challenge.error || 'Could not start sign-in.')

      // The user signs the exact message the server generated; the server re-derives
      // and verifies it against the single-use nonce.
      const signature = await signMessageAsync({ message: challenge.message })

      const verifyResponse = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: account.address, signature, nonce: challenge.nonce, issuedAt: challenge.issuedAt, chainId: challenge.chainId }),
      })
      const verified = await verifyResponse.json() as { address?: string; error?: string }
      if (!verifyResponse.ok || !verified.address) throw new Error(verified.error || 'Signature could not be verified.')

      setAuthenticatedAddress(verified.address)
      return true
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Sign-in failed.'
      setAuthError(/reject|denied|cancel/i.test(message) ? 'You declined the sign-in signature.' : message)
      return false
    } finally {
      setAuthPending(false)
    }
  }, [account.address, account.chainId, signMessageAsync])

  const signOut = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    setAuthenticatedAddress(null)
  }, [])

  const disconnectWallet = useCallback(async () => {
    setChooserOpen(false)
    await signOut()
    disconnect()
  }, [disconnect, signOut])

  const walletConnectConnector = connectors.find((candidate) => candidate.id === 'walletConnect')
  const wallets = connectors.filter((candidate) => candidate.id !== 'walletConnect')

  const addressMismatch = Boolean(
    account.address && authenticatedAddress && account.address.toLowerCase() !== authenticatedAddress.toLowerCase(),
  )

  // Signing out automatically on a wallet switch prevents acting as the previous
  // account after the user changes wallets in their extension.
  useEffect(() => {
    if (addressMismatch) void signOut()
  }, [addressMismatch, signOut])

  const value = useMemo<SessionState>(() => ({
    address: account.address,
    isConnected: Boolean(account.isConnected && account.address),
    chainId: account.chainId,
    chainStatus: getChainStatus(account.chainId),
    authenticatedAddress,
    isAuthenticated: Boolean(authenticatedAddress && account.address && authenticatedAddress.toLowerCase() === account.address.toLowerCase()),
    addressMismatch,
    authPending,
    authError,
    connectPending,
    connectors,
    wallets,
    walletConnectConnector,
    chooserOpen,
    openWalletChooser: () => setChooserOpen(true),
    closeWalletChooser: () => setChooserOpen(false),
    chooseWallet: (connector) => { setChooserOpen(false); connect({ connector }) },
    connectWalletConnect: () => { if (walletConnectConnector) { setChooserOpen(false); connect({ connector: walletConnectConnector }) } },
    disconnectWallet,
    signIn,
    signOut,
    switchToKymeraChain: () => switchChain({ chainId: KYMERA_CHAIN_ID }),
    switching,
  }), [account.address, account.isConnected, account.chainId, authenticatedAddress, addressMismatch, authPending, authError, connectPending, connectors, wallets, walletConnectConnector, chooserOpen, connect, disconnectWallet, signIn, signOut, switchChain, switching])

  return <KymeraSessionContext.Provider value={value}>{children}</KymeraSessionContext.Provider>
}

export function useKymeraSession() {
  const context = useContext(KymeraSessionContext)
  if (!context) throw new Error('useKymeraSession must be used inside KymeraSessionProvider')
  return context
}

export function WalletChooser() {
  const session = useKymeraSession()
  useEffect(() => {
    if (!session.chooserOpen) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') session.closeWalletChooser() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [session])

  if (!session.chooserOpen || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="wallet-dialog-title">
      <button type="button" className="absolute inset-0 bg-foreground/40" onClick={session.closeWalletChooser} aria-label="Close wallet dialog" />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p id="wallet-dialog-title" className="font-semibold">Connect wallet</p>
            <p className="mt-1 text-sm text-muted-foreground">Any EVM wallet works. Kymera never holds your keys.</p>
          </div>
          <button type="button" onClick={session.closeWalletChooser} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Close wallet dialog">×</button>
        </div>
        <div className="mt-6 flex flex-col gap-3">
          {session.wallets.map((wallet) => (
            <button key={wallet.uid} type="button" disabled={session.connectPending} onClick={() => session.chooseWallet(wallet)} className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-4 text-left text-sm transition hover:border-primary disabled:opacity-50">
              <span className="flex size-9 items-center justify-center rounded-lg bg-muted font-mono text-xs">{wallet.name.slice(0, 1)}</span>
              <span><strong>{wallet.name}</strong><span className="mt-1 block text-xs text-muted-foreground">Detected in this browser</span></span>
            </button>
          ))}
          {session.wallets.length === 0 && (
            <p className="rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">No injected wallets detected. Install an EVM wallet or use WalletConnect.</p>
          )}
          <button type="button" disabled={!session.walletConnectConnector || session.connectPending} onClick={session.connectWalletConnect} className="rounded-xl border border-border bg-background px-4 py-4 text-left text-sm disabled:opacity-50">
            <strong>WalletConnect</strong>
            <span className="mt-1 block text-xs text-muted-foreground">{session.walletConnectConnector ? 'Mobile or desktop wallet' : 'Unavailable — NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID not configured'}</span>
          </button>
        </div>
        <p className="mt-5 text-xs text-muted-foreground">{KYMERA_NETWORK_LABEL} · execution is testnet-only by default</p>
      </div>
    </div>,
    document.body,
  )
}
