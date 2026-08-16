import { bsc, bscTestnet } from 'wagmi/chains'

export { bsc }
export const kymeraChain = bscTestnet
export const KYMERA_CHAIN_ID = 97
export const KYMERA_NETWORK_LABEL = 'BNB Smart Chain Testnet'

export function isKymeraChain(chainId: number | undefined) {
  return chainId === KYMERA_CHAIN_ID
}

export function getChainStatus(chainId: number | undefined) {
  const isMainnet = chainId === bsc.id
  return {
    connected: Boolean(chainId),
    correctNetwork: isKymeraChain(chainId),
    mainnet: isMainnet,
    unsupported: Boolean(chainId) && !isKymeraChain(chainId) && !isMainnet,
    chainId: chainId ?? null,
    expectedChainId: KYMERA_CHAIN_ID,
    network: isMainnet ? 'BNB Smart Chain' : KYMERA_NETWORK_LABEL,
  }
}
