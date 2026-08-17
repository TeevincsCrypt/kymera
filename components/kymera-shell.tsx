'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Activity, Boxes, ChevronDown, Compass, LayoutDashboard, Menu, Network, Search, Sparkles, Trophy, Wallet, X } from 'lucide-react'
import { useState } from 'react'
import { WalletChooser, useWalletConnection } from '@/lib/web3/use-wallet-connection'

const navGroups = [
  { label: 'Workspace', items: [{ href: '/', label: 'Overview', icon: LayoutDashboard }, { href: '/discover', label: 'Discover agents', icon: Compass }, { href: '/arena', label: 'Benchmark arena', icon: Trophy }] },
  { label: 'Operate', items: [{ href: '/simulate', label: 'Simulate', icon: Sparkles }, { href: '/pancakeswap', label: 'PancakeSwap', icon: Activity }] },
  { label: 'Manage', items: [{ href: '/dashboard', label: 'My workspace', icon: Boxes }] },
]

export function KymeraShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const walletConnection = useWalletConnection()
  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-card px-5 py-6 transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-2"><Link href="/" className="flex items-center gap-2 font-semibold tracking-tight"><img src="/kymera-mark.svg" alt="" className="size-8" /> <span className="font-mono text-sm tracking-[0.22em]">KYMERA</span></Link><button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={18}/></button></div>
        <nav className="mt-10 flex flex-col gap-7" aria-label="Primary navigation">{navGroups.map((group) => <div key={group.label}><p className="mb-2 px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{group.label}</p><div className="flex flex-col gap-1">{group.items.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${pathname === href || (href !== '/' && pathname.startsWith(href)) ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}><Icon size={17}/>{label}</Link>)}</div></div>)}</nav>
        <div className="mt-auto flex flex-col gap-3"><div className="rounded-xl border border-border bg-muted/60 p-3"><div className="mb-2 flex items-center justify-between text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><Network size={13}/> Network</span><span className="flex items-center gap-1 text-primary"><span className="size-1.5 rounded-full bg-primary"/> BNB Chain</span></div><div className="text-xs text-muted-foreground">{walletConnection.chainId === 97 ? 'Testnet · connected' : walletConnection.chainId === 56 ? 'Mainnet · execution disabled' : 'Wallet not connected'}</div></div><button onClick={walletConnection.isConnected ? walletConnection.disconnectWallet : walletConnection.openWalletChooser} className="flex items-center justify-between rounded-xl bg-foreground px-3 py-3 text-left text-sm text-background"><span className="flex items-center gap-2"><Wallet size={16}/>{walletConnection.isConnected && walletConnection.address ? `${walletConnection.address.slice(0, 6)}…${walletConnection.address.slice(-4)}` : 'Connect wallet'}</span><ChevronDown size={15}/></button><WalletChooser connection={walletConnection} /></div>
      </aside>
      {open && <button className="fixed inset-0 z-30 bg-black/20 lg:hidden" onClick={() => setOpen(false)} aria-label="Close navigation overlay"/>}
      <div className="lg:pl-64"><header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-background/90 px-5 backdrop-blur md:px-8"><button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={20}/></button><div className="hidden items-center gap-2 text-sm text-muted-foreground md:flex"><span className="size-2 rounded-full bg-primary"/> Agent infrastructure, without the guesswork</div><div className="ml-auto flex items-center gap-4"><Link href="/discover" className="hidden items-center gap-2 text-sm text-muted-foreground hover:text-foreground sm:flex"><Search size={16}/> Search agents</Link><Link href="/dashboard" className="flex items-center gap-2 text-sm font-medium"><span className="flex size-7 items-center justify-center rounded-full bg-accent text-xs text-accent-foreground">KY</span><span className="hidden md:block">Workspace</span></Link></div></header><main>{children}</main></div>
    </div>
  )
}
