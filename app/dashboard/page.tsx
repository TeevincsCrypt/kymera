'use client'

import { DashboardPage } from '@/components/workspace-pages'
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
  return <><DashboardPage /><section id="sessions" className="mx-auto max-w-7xl px-5 pb-14 md:px-8"><div className="mb-4"><p className="text-sm font-medium text-[#e95d25]">Kymera Guard</p><h2 className="mt-1 text-2xl font-semibold tracking-[-.03em]">Authorization sessions</h2><p className="mt-2 text-sm text-[#77736c]">Simulation-only session lifecycle and audit visibility.</p></div><DashboardControlPlane /><div className="mt-6"><TestnetWalletGuard /></div><div className="mt-6"><AltanaStatusPanel /></div><div className="mt-6"><ExecutionControlPanel /></div><div className="mt-6">{address ? <SessionConsole userAddress={address} /> : <div className="rounded-xl border border-dashed border-[#d9d4cd] bg-white px-5 py-8 text-center text-sm text-[#77736c]">Connect your wallet to view Guard sessions.</div>}</div><div className="mt-6"><MyHires /></div></section></>
}
