import { DashboardPage } from '@/components/workspace-pages'
import { SessionConsole } from '@/components/session-console'
import { MyHires } from '@/components/my-hires'
import { AltanaStatusPanel } from '@/components/altana-status-panel'

export default function Page() {
  return <><DashboardPage /><section className="mx-auto max-w-7xl px-5 pb-14 md:px-8"><div className="mb-4"><p className="text-sm font-medium text-[#e95d25]">Kymera Guard</p><h2 className="mt-1 text-2xl font-semibold tracking-[-.03em]">Authorization sessions</h2><p className="mt-2 text-sm text-[#77736c]">Simulation-only session lifecycle and audit visibility.</p></div><AltanaStatusPanel /><div className="mt-6"><SessionConsole userAddress="0xDemoWallet" /></div><div className="mt-6"><MyHires /></div></section></>
}
