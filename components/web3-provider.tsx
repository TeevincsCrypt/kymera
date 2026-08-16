'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { injected, walletConnect } from 'wagmi/connectors'
import { bsc, kymeraChain } from '@/lib/web3/config'
import { getSelectedEip6963Provider } from '@/lib/web3/eip6963'

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
const connectors = [
  injected({ shimDisconnect: true, target: () => getSelectedEip6963Provider() }),
  ...(walletConnectProjectId ? [walletConnect({ projectId: walletConnectProjectId, showQrModal: true })] : []),
]

const config = createConfig({
  chains: [kymeraChain, bsc],
  connectors,
  transports: { [kymeraChain.id]: http(), [bsc.id]: http() },
})

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  return <WagmiProvider config={config} reconnectOnMount={false}><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></WagmiProvider>
}
