import { parseUnits, type Address } from 'viem'

export type PancakeAction = 'swap' | 'add_liquidity' | 'remove_liquidity'

export const PANCAKE_V3_ROUTER: Record<number, Address> = {
  56: '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4',
  97: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
}

export function validateActionInput(input: { action?: string; tokenIn?: string; tokenOut?: string; amount?: string; decimals?: number }) {
  if (!['swap', 'add_liquidity', 'remove_liquidity'].includes(input.action || '')) throw new Error('Unsupported PancakeSwap action')
  if (!input.tokenIn || !input.tokenOut) throw new Error('Token addresses are required')
  if (!/^0x[a-fA-F0-9]{40}$/.test(input.tokenIn) || !/^0x[a-fA-F0-9]{40}$/.test(input.tokenOut)) throw new Error('Token addresses are invalid')
  if (!input.amount || !/^\d+(\.\d+)?$/.test(input.amount) || Number(input.amount) <= 0) throw new Error('Amount must be a positive decimal')
  const decimals = Number.isInteger(input.decimals) && input.decimals! >= 0 && input.decimals! <= 36 ? input.decimals! : 18
  return { action: input.action as PancakeAction, tokenIn: input.tokenIn as Address, tokenOut: input.tokenOut as Address, amount: parseUnits(input.amount, decimals), decimals }
}

export function buildErc20Approve(token: Address, spender: Address, amount: bigint) {
  return { address: token, abi: [{ type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }] as const, functionName: 'approve' as const, args: [spender, amount] as const }
}

export function buildSwapCall(router: Address, tokenIn: Address, tokenOut: Address, amountIn: bigint, recipient: Address) {
  return { address: router, abi: [{ type: 'function', name: 'exactInputSingle', stateMutability: 'payable', inputs: [{ name: 'params', type: 'tuple', components: [{ name: 'tokenIn', type: 'address' }, { name: 'tokenOut', type: 'address' }, { name: 'fee', type: 'uint24' }, { name: 'recipient', type: 'address' }, { name: 'amountIn', type: 'uint256' }, { name: 'amountOutMinimum', type: 'uint256' }, { name: 'sqrtPriceLimitX96', type: 'uint160' }] }], outputs: [{ name: 'amountOut', type: 'uint256' }] }] as const, functionName: 'exactInputSingle' as const, args: [{ tokenIn, tokenOut, fee: 2500, recipient, amountIn, amountOutMinimum: BigInt(0), sqrtPriceLimitX96: BigInt(0) }] as const }
}
