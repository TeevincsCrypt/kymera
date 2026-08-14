import { bscTestnet } from 'wagmi/chains'

export const ERC8183_ADDRESSES = { agenticCommerce: '0xa206c0517b6371c6638cd9e4a42cc9f02a33b0de' as `0x${string}`, evaluatorRouter: '0xd7d36d66d2f1b608a0f943f722d27e3744f66f25' as `0x${string}`, optimisticPolicy: '0x4f4678d4439fec812ac7674bb3efb4c8f5fb78a6' as `0x${string}`, paymentToken: '0xc70b8741b8b07a6d61e54fd4b20f22fa648e5565' as `0x${string}` } as const

export type AgentJobStatus = 'open' | 'funded' | 'submitted' | 'completed' | 'rejected'

export type AgentJobPreview = {
  jobId: string
  chainId: number
  network: string
  client: `0x${string}`
  provider: `0x${string}`
  evaluator: `0x${string}`
  budget: string
  status: AgentJobStatus
  simulated: boolean
}

export function createJobPreview(input: { client: `0x${string}`; provider: `0x${string}`; evaluator: `0x${string}`; budget: string }): AgentJobPreview {
  return { jobId: `sim_job_${crypto.randomUUID()}`, chainId: bscTestnet.id, network: 'BNB Smart Chain Testnet', ...input, status: 'open', simulated: true }
}

export function isSupportedJobNetwork(chainId: number | undefined) {
  return chainId === bscTestnet.id
}
