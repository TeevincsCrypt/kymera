import { createHash } from 'node:crypto'

export type Erc8004Identity = {
  chainId: number
  registryAddress: string
  tokenId: string
}

export type Erc8004Registration = Erc8004Identity & {
  metadataUri: string
  metadataHash?: string
  ownerAddress: string
  status: 'Live' | 'Paused' | 'Beta'
  raw: unknown
}

export type Erc8004Metadata = {
  name?: string
  description?: string
  category?: string
  capabilities?: string[]
  supportedProtocols?: string[]
  endpoint?: string
  ownerAddress?: string
  image?: string
  [key: string]: unknown
}

// Mirrors bnb-chain/bnbagent-sdk network defaults (bnbagent/config.py).
// Source: https://github.com/bnb-chain/bnbagent-sdk and the BNB Agent SDK network docs.
const NETWORKS = {
  'bsc-mainnet': { chainId: 56, registryAddress: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432', rpcUrl: 'https://bsc-dataseed.binance.org' },
  'bsc-testnet': { chainId: 97, registryAddress: '0x8004A818BFB912233c491871b3d84c89A494BD9e', rpcUrl: 'https://data-seed-prebsc-1-s1.bnbchain.org:8545' },
} as const

function env(name: string) { return process.env[name]?.trim() }

export function getBnbConfig() {
  const network = env('NETWORK') === 'bsc-testnet' ? 'bsc-testnet' : 'bsc-mainnet'
  const defaults = NETWORKS[network]
  const registryAddress = env('ERC8004_REGISTRY_ADDRESS') || defaults.registryAddress
  if (!/^0x[a-fA-F0-9]{40}$/.test(registryAddress) || /^0x0{40}$/i.test(registryAddress)) {
    throw new Error(`Invalid ERC-8004 registry address for ${network}`)
  }
  return { network, chainId: defaults.chainId, rpcUrl: env('RPC_URL') || env('BNB_RPC_URL') || defaults.rpcUrl, registryAddress }
}

async function rpc(method: string, params: unknown[]) {
  const response = await fetch(getBnbConfig().rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error(`BNB RPC returned ${response.status}`)
  const payload = await response.json() as { result?: string; error?: { message?: string } }
  if (payload.error) throw new Error(payload.error.message || 'BNB RPC error')
  return payload.result
}

export function parseMetadata(input: unknown): Erc8004Metadata {
  if (!input || typeof input !== 'object') return {}
  const value = input as Record<string, unknown>
  const list = (key: string) => Array.isArray(value[key]) ? value[key].map(String).filter(Boolean) : undefined
  return {
    ...value,
    name: typeof value.name === 'string' ? value.name : undefined,
    description: typeof value.description === 'string' ? value.description : undefined,
    category: typeof value.category === 'string' ? value.category : undefined,
    capabilities: list('capabilities'),
    supportedProtocols: list('supportedProtocols'),
    endpoint: typeof value.endpoint === 'string' ? value.endpoint : undefined,
    ownerAddress: typeof value.ownerAddress === 'string' ? value.ownerAddress : undefined,
  }
}

export async function discoverIdentities(): Promise<Erc8004Identity[]> {
  const config = getBnbConfig()
  const configured = env('ERC8004_REGISTRATIONS_JSON')
  if (configured) {
    const rows = JSON.parse(configured) as Array<Record<string, unknown>>
    return rows.map((row) => ({ chainId: Number(row.chainId || config.chainId), registryAddress: String(row.registryAddress || config.registryAddress), tokenId: String(row.tokenId) })).filter((item) => item.tokenId && item.registryAddress.toLowerCase() === config.registryAddress.toLowerCase())
  }
  const indexerUrl = env('ERC8004_INDEXER_URL')
  if (!indexerUrl) return []
  const response = await fetch(indexerUrl, { signal: AbortSignal.timeout(12_000) })
  if (!response.ok) throw new Error(`ERC-8004 indexer returned ${response.status}`)
  const payload = await response.json() as { registrations?: Array<Record<string, unknown>> }
  return (payload.registrations || []).map((row) => ({ chainId: Number(row.chainId || config.chainId), registryAddress: String(row.registryAddress || config.registryAddress), tokenId: String(row.tokenId) })).filter((item) => item.tokenId && item.registryAddress.toLowerCase() === config.registryAddress.toLowerCase())
}

export async function readRegistration(identity: Erc8004Identity): Promise<Erc8004Registration> {
  // Registry ABI/event indexing is deliberately isolated here. Configure an indexer URL
  // for production, or provide ERC8004_REGISTRATIONS_JSON for deterministic imports.
  const configured = env('ERC8004_REGISTRATIONS_JSON')
  if (configured) {
    const rows = JSON.parse(configured) as Array<Record<string, unknown>>
    const match = rows.find((row) => String(row.tokenId) === identity.tokenId && String(row.registryAddress).toLowerCase() === identity.registryAddress.toLowerCase())
    if (match) return normalizeRegistration(identity, match)
  }
  await rpc('eth_chainId', [])
  throw new Error('ERC-8004 registration indexer is not configured for this registry')
}

function normalizeRegistration(identity: Erc8004Identity, row: Record<string, unknown>): Erc8004Registration {
  const metadata = parseMetadata(row.metadata)
  return {
    ...identity,
    metadataUri: String(row.metadataUri || metadata.metadataUri || ''),
    metadataHash: typeof row.metadataHash === 'string' ? row.metadataHash : undefined,
    ownerAddress: String(row.ownerAddress || metadata.ownerAddress || ''),
    status: row.status === 'Paused' || row.status === 'Beta' ? row.status : 'Live',
    raw: row,
  }
}

export async function loadMetadata(uri: string): Promise<{ data: Erc8004Metadata; hash: string }> {
  if (!uri) return { data: {}, hash: createHash('sha256').update('{}').digest('hex') }
  const response = await fetch(uri, { signal: AbortSignal.timeout(12_000) })
  if (!response.ok) throw new Error(`Metadata returned ${response.status}`)
  const text = await response.text()
  try { return { data: parseMetadata(JSON.parse(text)), hash: createHash('sha256').update(text).digest('hex') } }
  catch { throw new Error('ERC-8004 agentURI metadata is not valid JSON') }
}
