'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Activity, BarChart3, Boxes, ChevronDown, Compass, ExternalLink, LayoutDashboard, Menu, Network, Search, ShieldCheck, Sparkles, Trophy, Wallet, X } from 'lucide-react'
import { useState } from 'react'
import { WalletChooser, useWalletConnection } from '@/lib/web3/use-wallet-connection'

const nav = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/discover', label: 'Discover agents', icon: Compass },
  { href: '/arena', label: 'Benchmark arena', icon: Trophy },
  { href: '/simulate', label: 'Simulate', icon: Sparkles },
  { href: '/pancakeswap', label: 'PancakeSwap', icon: Activity },
  { href: '/dashboard', label: 'My workspace', icon: Boxes },
]

export function KymeraShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const walletConnection = useWalletConnection()
  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-[#fffdfb] px-5 py-6 transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-2"><Link href="/" className="flex items-center gap-2 font-semibold tracking-tight"><img src="/kymera-mark.svg" alt="" className="size-8" /> <span className="font-mono text-sm tracking-[0.22em]">KYMERA</span></Link><button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={18}/></button></div>
        <div className="mt-10 flex flex-col gap-1">{nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${pathname === href || (href !== '/' && pathname.startsWith(href)) ? 'bg-secondary text-secondary-foreground' : 'text-[#6f6c66] hover:bg-muted hover:text-foreground'}`}><Icon size={17}/>{label}</Link>)}</div>
        <div className="mt-auto flex flex-col gap-3"><div className="rounded-xl border border-border bg-muted/60 p-3"><div className="mb-2 flex items-center justify-between text-xs text-[#77736c]"><span className="flex items-center gap-1.5"><Network size={13}/> Network</span><span className="flex items-center gap-1 text-[#138a61]"><span className="size-1.5 rounded-full bg-[#138a61]"/> BNB Chain</span></div><div className="text-xs text-[#9b978f]">{walletConnection.chainId === 97 ? 'Testnet · connected' : walletConnection.chainId === 56 ? 'Mainnet · execution disabled' : 'Wallet not connected'}</div></div><button onClick={walletConnection.isConnected ? walletConnection.disconnectWallet : walletConnection.openWalletChooser} className="flex items-center justify-between rounded-xl bg-foreground px-3 py-3 text-left text-sm text-background"><span className="flex items-center gap-2"><Wallet size={16}/>{walletConnection.isConnected && walletConnection.address ? `${walletConnection.address.slice(0, 6)}…${walletConnection.address.slice(-4)}` : 'Connect wallet'}</span><ChevronDown size={15}/></button><WalletChooser connection={walletConnection} /></div>
      </aside>
      {open && <button className="fixed inset-0 z-30 bg-black/20 lg:hidden" onClick={() => setOpen(false)} aria-label="Close navigation overlay"/>}
      <div className="lg:pl-64"><header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-background/90 px-5 backdrop-blur md:px-8"><button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={20}/></button><div className="hidden items-center gap-2 text-sm text-[#77736c] md:flex"><span className="size-2 rounded-full bg-primary"/> Agent infrastructure, without the guesswork</div><div className="ml-auto flex items-center gap-4"><Link href="/discover" className="hidden items-center gap-2 text-sm text-[#6f6c66] hover:text-[#171717] sm:flex"><Search size={16}/> Search agents</Link><Link href="/dashboard" className="flex items-center gap-2 text-sm font-medium"><span className="flex size-7 items-center justify-center rounded-full bg-accent text-xs text-accent-foreground">JD</span><span className="hidden md:block">Jordan Davis</span></Link></div></header><main>{children}</main></div>
    </div>
  )
}
