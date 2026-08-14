import { createPublicClient, http, type Address } from 'viem'
import { bscTestnet } from 'wagmi/chains'

const identityRegistry = process.env.NEXT_PUBLIC_ERC8004_IDENTITY_REGISTRY as Address | undefined

const client = createPublicClient({ chain: bscTestnet, transport: http() })

export async function verifyTestnetIdentity(agentId: bigint) {
  if (!identityRegistry) return { available: false, verified: false, reason: 'IDENTITY_REGISTRY_NOT_CONFIGURED', chainId: bscTestnet.id }
  try {
    const owner = await client.readContract({ address: identityRegistry, abi: [{ type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }] }], functionName: 'ownerOf', args: [agentId] })
    return { available: true, verified: owner !== '0x0000000000000000000000000000000000000000', owner, chainId: bscTestnet.id }
  } catch (error) {
    return { available: true, verified: false, chainId: bscTestnet.id, reason: error instanceof Error ? error.message : 'IDENTITY_LOOKUP_FAILED' }
  }
}
