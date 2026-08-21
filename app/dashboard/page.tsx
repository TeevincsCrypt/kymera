'use client'

import { RealDashboardPage } from '@/components/real-dashboard-page'
import { SessionConsole } from '@/components/session-console'
import { MyHires } from '@/components/my-hires'
import { DashboardControlPlane } from '@/components/dashboard-control-plane'
import { TestnetWalletGuard } from '@/components/testnet-wallet-guard'
import { useKymeraSession } from '@/lib/web3/kymera-session'

export default function Page() {
  const session = useKymeraSession()

  return (
    <>
      <RealDashboardPage />
      <section className="mx-auto max-w-7xl px-5 pb-14 md:px-8">
        <DashboardControlPlane />

        <div className="mt-8">
          <p className="text-sm font-medium text-primary">Kymera Guard</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-.03em]">Authorization sessions</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Each session states exactly which contracts and methods an agent may touch and how much it may spend. Revoking one cancels its outstanding authorizations immediately.
          </p>
          <div className="mt-4">
            {session.isAuthenticated ? (
              <SessionConsole />
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
                Sign in with your wallet to view Guard sessions.
              </div>
            )}
          </div>
        </div>

        <div className="mt-8"><TestnetWalletGuard /></div>
        <div className="mt-8">{session.isAuthenticated ? <MyHires /> : null}</div>
      </section>
    </>
  )
}
