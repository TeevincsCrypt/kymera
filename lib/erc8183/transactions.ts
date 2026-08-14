import { bscTestnet } from 'wagmi/chains'
import { encodeFunctionData, type Address, type PublicClient, type WalletClient } from 'viem'
import { ERC8183_ADDRESSES } from '@/lib/erc8183/testnet'

export const agenticCommerceAbi = [{ type: 'function', name: 'createJob', stateMutability: 'nonpayable', inputs: [{ name: 'provider', type: 'address' }, { name: 'evaluator', type: 'address' }, { name: 'expiredAt', type: 'uint256' }, { name: 'description', type: 'string' }, { name: 'hook', type: 'address' }], outputs: [{ name: 'jobId', type: 'uint256' }] }] as const

export type JobTransaction = { chainId: 97; from: Address; to: Address; data: `0x${string}`; value: bigint; method: 'createJob'; description: string; estimatedGas?: bigint }

export function prepareJobTransaction(input: { from: Address; provider: Address; description?: string; expirySeconds?: number }): JobTransaction {
  if (!input.from || !input.provider) throw new Error('WALLET_REQUIRED')
  const description = input.description ?? 'Kymera testnet agent job'
  const expiredAt = BigInt(Math.floor(Date.now() / 1000) + Math.max(input.expirySeconds ?? 3600, 300))
  const data = encodeFunctionData({ abi: agenticCommerceAbi, functionName: 'createJob', args: [input.provider, ERC8183_ADDRESSES.evaluatorRouter, expiredAt, description, ERC8183_ADDRESSES.evaluatorRouter] })
  return { chainId: bscTestnet.id, from: input.from, to: ERC8183_ADDRESSES.agenticCommerce, data, value: 0n, method: 'createJob', description }
}

export async function estimateJobTransaction(publicClient: PublicClient, tx: JobTransaction) {
  const estimatedGas = await publicClient.estimateGas({ account: tx.from, to: tx.to, data: tx.data, value: tx.value })
  return { ...tx, estimatedGas }
}

export async function submitJobTransaction(walletClient: WalletClient, tx: JobTransaction) {
  if (walletClient.chain?.id !== bscTestnet.id) throw new Error('WRONG_NETWORK')
  return walletClient.sendTransaction({ account: tx.from, chain: bscTestnet, to: tx.to, data: tx.data, value: tx.value })
}

export async function waitForJobConfirmation(publicClient: PublicClient, hash: `0x${string}`) {
  return publicClient.waitForTransactionReceipt({ hash })
}
