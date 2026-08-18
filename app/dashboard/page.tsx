'use client'

import { RealDashboardPage } from '@/components/real-dashboard-page'
import { useWalletConnection } from '@/lib/web3/use-wallet-connection'
import { SessionConsole } from '@/components/session-console'
import { MyHires } from '@/components/my-hires'
import { AltanaStatusPanel } from '@/components/altana-status-panel'
import { ExecutionControlPanel } from '@/components/execution-control-panel'
import { DashboardControlPlane } from '@/components/dashboard-control-plane'
import { TestnetWalletGuard } from '@/components/testnet-wallet-guard'

export const dynamic = 'force-dynamic'

export default function Page() {
  const { address } = useWalletConnection()
  return <><RealDashboardPage walletAddress={address} /><section id="sessions" className="mx-auto max-w-7xl px-5 pb-14 md:px-8"><div className="mb-4"><p className="text-sm font-medium text-primary">Kymera Guard</p><h2 className="mt-1 text-2xl font-semibold tracking-[-.03em]">Authorization sessions</h2><p className="mt-2 text-sm text-muted-foreground">Simulation-only session lifecycle and audit visibility.</p></div><DashboardControlPlane /><div className="mt-6"><TestnetWalletGuard /></div><div className="mt-6"><AltanaStatusPanel /></div><div className="mt-6"><ExecutionControlPanel /></div><div className="mt-6">{address ? <SessionConsole userAddress={address} /> : <div className="rounded-xl border border-dashed border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">Connect your wallet to view Guard sessions.</div>}</div><div className="mt-6"><MyHires /></div></section></>
}
