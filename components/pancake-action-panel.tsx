'use client'

import { useState } from 'react'
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import { bsc, bscTestnet } from 'wagmi/chains'
import { buildErc20Approve, buildSwapCall, PANCAKE_V3_ROUTER, validateActionInput } from '@/lib/pancakeswap/execution'

export function PancakeActionPanel({ tokenIn, tokenOut }: { tokenIn: string; tokenOut: string }) {
  const { address } = useAccount()
  const chainId = useChainId()
  const client = usePublicClient()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync, isPending } = useWriteContract()
  const [amount, setAmount] = useState('')
  const [action, setAction] = useState<'swap' | 'add_liquidity' | 'remove_liquidity'>('swap')
  const [message, setMessage] = useState('')

  async function execute() {
    try {
      if (!address) throw new Error('Connect a wallet before signing')
      if (action !== 'swap') throw new Error('Liquidity movement requires a position manager flow with token amounts and fee tier; select a swap or provide a complete liquidity position.')
      const input = validateActionInput({ action, tokenIn, tokenOut, amount, decimals: 18 })
      const targetChain = chainId === bsc.id ? bsc : bscTestnet
      const router = PANCAKE_V3_ROUTER[targetChain.id]
      if (!router) throw new Error('Unsupported BNB network')
      if (chainId !== targetChain.id) await switchChainAsync({ chainId: targetChain.id })
      setMessage('Approve the token in your wallet…')
      await writeContractAsync(buildErc20Approve(input.tokenIn, router, input.amount))
      setMessage('Approve confirmed. Review the swap transaction in your wallet…')
      const hash = await writeContractAsync(buildSwapCall(router, input.tokenIn, input.tokenOut, input.amount, address))
      setMessage(client ? `Submitted ${hash}. Waiting for confirmation…` : `Submitted ${hash}.`)
      if (client) { await client.waitForTransactionReceipt({ hash }); setMessage(`Confirmed: ${hash}`) }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Wallet transaction failed') }
  }

  return <div className="mt-4 rounded-xl border border-border bg-background p-4"><div className="flex flex-wrap gap-2"><select value={action} onChange={(event) => setAction(event.target.value as typeof action)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm"><option value="swap">Swap</option><option value="add_liquidity">Add liquidity</option><option value="remove_liquidity">Remove liquidity</option></select><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="Amount of token in" className="h-10 min-w-40 flex-1 rounded-lg border border-input bg-background px-3 text-sm" /><button type="button" disabled={isPending} onClick={execute} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{isPending ? 'Signing…' : 'Review and sign'}</button></div>{message && <p className="mt-3 break-all text-xs text-muted-foreground">{message}</p>}</div>
}
