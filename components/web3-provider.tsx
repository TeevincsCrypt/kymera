'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { injected, walletConnect } from 'wagmi/connectors'
import { bsc, kymeraChain } from '@/lib/web3/config'
import { KymeraSessionProvider } from '@/lib/web3/kymera-session'

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID

// `injected` uses EIP-6963 discovery, so every injected EVM wallet the browser
// announces is offered — Kymera is not tied to any single wallet vendor.
const connectors = [
  injected({ shimDisconnect: true }),
  ...(walletConnectProjectId ? [walletConnect({ projectId: walletConnectProjectId, showQrModal: true })] : []),
]

const config = createConfig({
  chains: [kymeraChain, bsc],
  connectors,
  transports: { [kymeraChain.id]: http(), [bsc.id]: http() },
})

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  return (
    <WagmiProvider config={config} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>
        <KymeraSessionProvider>{children}</KymeraSessionProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
