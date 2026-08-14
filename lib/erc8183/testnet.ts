import { bscTestnet } from 'wagmi/chains'

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
