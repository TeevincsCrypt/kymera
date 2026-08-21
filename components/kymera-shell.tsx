'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Activity, Boxes, Compass, LayoutDashboard, Menu, Network, Search, ShieldCheck, Sparkles, Trophy, Wallet, X } from 'lucide-react'
import { WalletChooser, useKymeraSession } from '@/lib/web3/kymera-session'
import { KYMERA_CHAIN_ID } from '@/lib/web3/config'

const navGroups = [
  { label: 'Workspace', items: [{ href: '/', label: 'Overview', icon: LayoutDashboard }, { href: '/discover', label: 'Discover agents', icon: Compass }, { href: '/arena', label: 'Arena', icon: Trophy }] },
  { label: 'Operate', items: [{ href: '/simulate', label: 'Guard dry-run', icon: Sparkles }, { href: '/pancakeswap', label: 'PancakeSwap', icon: Activity }] },
  { label: 'Manage', items: [{ href: '/dashboard', label: 'My workspace', icon: Boxes }] },
]

export function KymeraShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const session = useKymeraSession()

  const networkLabel = !session.isConnected
    ? 'Wallet not connected'
    : session.chainId === KYMERA_CHAIN_ID
      ? 'Testnet · connected'
      : session.chainStatus.mainnet
        ? 'Mainnet · execution disabled'
        : `Chain ${session.chainId} · unsupported`

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col overflow-y-auto border-r border-border bg-card px-5 py-6 transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-2">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <img src="/kymera-mark.svg" alt="" className="size-8" />
            <span className="font-mono text-sm tracking-[0.22em]">KYMERA</span>
          </Link>
          <button type="button" className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={18} /></button>
        </div>

        <nav className="mt-10 flex flex-col gap-7" aria-label="Primary">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="mb-2 px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{group.label}</p>
              <div className="flex flex-col gap-1">
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href || (href !== '/' && pathname.startsWith(href))
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${active ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                    >
                      <Icon size={17} aria-hidden />{label}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-3 pt-6">
          <div className="rounded-xl border border-border bg-muted/60 p-3">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><Network size={13} aria-hidden /> Network</span>
              <span className="flex items-center gap-1 text-primary"><span className="size-1.5 rounded-full bg-primary" aria-hidden /> BNB</span>
            </div>
            <div className="text-xs text-muted-foreground">{networkLabel}</div>
            {session.isConnected && session.chainId !== KYMERA_CHAIN_ID && (
              <button type="button" onClick={session.switchToKymeraChain} disabled={session.switching} className="mt-2 w-full rounded-lg border border-border px-2 py-1.5 text-xs font-medium">
                {session.switching ? 'Switching…' : 'Switch to testnet'}
              </button>
            )}
          </div>

          {session.isConnected && !session.isAuthenticated && (
            <button type="button" onClick={() => void session.signIn()} disabled={session.authPending} className="rounded-xl bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">
              {session.authPending ? 'Waiting for signature…' : 'Sign in with wallet'}
            </button>
          )}

          <button
            type="button"
            onClick={session.isConnected ? () => void session.disconnectWallet() : session.openWalletChooser}
            className="flex items-center justify-between rounded-xl bg-foreground px-3 py-3 text-left text-sm text-background"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Wallet size={16} aria-hidden />
              <span className="truncate">
                {session.isConnected && session.address ? `${session.address.slice(0, 6)}…${session.address.slice(-4)}` : 'Connect wallet'}
              </span>
            </span>
            {session.isAuthenticated && <ShieldCheck size={14} className="shrink-0 text-[#8fe0ad]" aria-label="Signed in" />}
          </button>

          {session.isAuthenticated && <p className="px-1 text-[10px] text-muted-foreground">Wallet ownership verified</p>}
          <WalletChooser />
        </div>
      </aside>

      {open && <button type="button" className="fixed inset-0 z-30 bg-black/20 lg:hidden" onClick={() => setOpen(false)} aria-label="Close navigation overlay" />}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-background/90 px-5 backdrop-blur md:px-8">
          <button type="button" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <div className="hidden items-center gap-2 text-sm text-muted-foreground md:flex">
            <ShieldCheck size={14} className="text-primary" aria-hidden /> Agents act on-chain only within the limits you set
          </div>
          <div className="ml-auto flex items-center gap-4">
            <Link href="/discover" className="hidden items-center gap-2 text-sm text-muted-foreground hover:text-foreground sm:flex"><Search size={16} aria-hidden /> Search agents</Link>
            <Link href="/dashboard" className="flex items-center gap-2 text-sm font-medium">
              <span className="flex size-7 items-center justify-center rounded-full bg-accent text-xs text-accent-foreground">KY</span>
              <span className="hidden md:block">Workspace</span>
            </Link>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  )
}
