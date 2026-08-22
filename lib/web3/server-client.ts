import { createPublicClient, http, type PublicClient } from 'viem'
import { bsc, bscTestnet } from 'viem/chains'
import { BSC_MAINNET_CHAIN_ID, BSC_TESTNET_CHAIN_ID } from '@/lib/guard/policy'

/**
 * Server-side read/simulation clients. These never hold a private key — Kymera has
 * no custody and signs nothing. They exist so Guard can simulate a transaction
 * before asking the user's wallet to sign it.
 */
const clients = new Map<number, PublicClient>()

function rpcFor(chainId: number) {
  if (chainId === BSC_MAINNET_CHAIN_ID) return process.env.BNB_MAINNET_RPC_URL?.trim() || process.env.RPC_URL?.trim() || undefined
  return process.env.BNB_TESTNET_RPC_URL?.trim() || process.env.BNB_RPC_URL?.trim() || undefined
}

export function getServerPublicClient(chainId: number): PublicClient | null {
  if (chainId !== BSC_MAINNET_CHAIN_ID && chainId !== BSC_TESTNET_CHAIN_ID) return null
  const cached = clients.get(chainId)
  if (cached) return cached
  const chain = chainId === BSC_MAINNET_CHAIN_ID ? bsc : bscTestnet
  const url = rpcFor(chainId)
  const client = createPublicClient({ chain, transport: http(url) }) as PublicClient
  clients.set(chainId, client)
  return client
}
