import { bscTestnet } from 'wagmi/chains'

export const kymeraChain = bscTestnet
export const KYMERA_CHAIN_ID = 97
export const KYMERA_NETWORK_LABEL = 'BNB Smart Chain Testnet'

export function isKymeraChain(chainId: number | undefined) {
  return chainId === KYMERA_CHAIN_ID
}

export function getChainStatus(chainId: number | undefined) {
  return {
    connected: Boolean(chainId),
    correctNetwork: isKymeraChain(chainId),
    chainId: chainId ?? null,
    expectedChainId: KYMERA_CHAIN_ID,
    network: KYMERA_NETWORK_LABEL,
  }
}
