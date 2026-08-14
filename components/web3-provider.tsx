'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { kymeraChain } from '@/lib/web3/config'

const config = createConfig({
  chains: [kymeraChain],
  connectors: [injected({ shimDisconnect: true })],
  transports: { [kymeraChain.id]: http() },
})

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  return <WagmiProvider config={config}><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></WagmiProvider>
}
