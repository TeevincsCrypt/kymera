import { createHash } from 'node:crypto'
import { enumerateAllAgents } from './enumerator'

export type Erc8004Identity = {
  chainId: number
  registryAddress: string
  tokenId: string
  scanRecord?: Record<string, unknown>
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

export async function checkBnbRuntime() {
  const config = getBnbConfig()
  const chainHex = await rpc('eth_chainId', [])
  const blockHex = await rpc('eth_blockNumber', [])
  const registryCode = await rpc('eth_getCode', [config.registryAddress, 'latest'])
  return { chainId: Number.parseInt(String(chainHex), 16), blockNumber: Number.parseInt(String(blockHex), 16), registryStatus: registryCode && registryCode !== '0x' ? 'reachable' as const : 'no-code' as const }
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

/**
 * The categories the marketplace filters by. Every agent MUST end up in exactly one
 * of these — a registry-supplied category that does not map here is normalised rather
 * than passed through, otherwise the agent becomes unreachable behind every filter.
 */
export const AGENT_CATEGORIES = ['Trading', 'DeFi', 'Research', 'Analytics', 'Monitoring', 'Security', 'Operations', 'Creative'] as const
export type AgentCategoryName = (typeof AGENT_CATEGORIES)[number]

const CATEGORY_RULES: Array<[AgentCategoryName, RegExp]> = [
  ['DeFi', /defi|liquidity|lending|borrow|staking|pool|pancake|amm|vault|farm|dex|swap/i],
  ['Trading', /trade|trading|arbitrage|market maker|portfolio|yield|invest|price|signal|alpha|bot/i],
  ['Security', /security|audit|guard|permission|risk|compliance|threat|exploit|scam|phish|safety/i],
  ['Analytics', /analytic|data|metric|dashboard|index|statistic|chart|insight|onchain analysis/i],
  ['Monitoring', /monitor|alert|watch|track|notify|observ|uptime|surveil/i],
  // `search` is word-bounded on purpose: unbounded it also matches "research",
  // "researcher" and similar, which pulled unrelated agents into this bucket.
  ['Research', /research|analysis|analyse|analyze|\bsearch\b|summar|\breport\b|intelligence|due diligence/i],
  ['Creative', /creative|content|design|write|writing|image|video|media|art|music|meme|social/i],
  ['Operations', /operation|workflow|automation|triage|orchestrat|routing|task|assistant|agent ops|support/i],
]

/** Maps a free-text category onto the marketplace's fixed set. */
function normalizeCategory(raw: unknown): AgentCategoryName | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const value = raw.trim()
  const exact = AGENT_CATEGORIES.find((category) => category.toLowerCase() === value.toLowerCase())
  if (exact) return exact
  return CATEGORY_RULES.find(([, rule]) => rule.test(value))?.[0] ?? null
}

export function evidenceCategory(value: Record<string, unknown>): AgentCategoryName {
  const declared = normalizeCategory(value.category)
  if (declared) return declared
  const evidence = [
    value.name,
    value.description,
    value.endpoint,
    ...(Array.isArray(value.capabilities) ? value.capabilities : []),
    ...(Array.isArray(value.supportedProtocols) ? value.supportedProtocols : []),
    ...(Array.isArray((value as { tags?: unknown[] }).tags) ? (value as { tags: unknown[] }).tags : []),
  ].filter(Boolean).join(' ')
  // Falls back to Operations only when nothing at all matched, which is a real
  // statement about the metadata rather than a silent default.
  return CATEGORY_RULES.find(([, rule]) => rule.test(evidence))?.[0] ?? 'Operations'
}

function evidenceDescription(value: Record<string, unknown>, category: string) {
  if (typeof value.description === 'string' && value.description.trim()) return value.description.trim()
  const capabilities = Array.isArray(value.capabilities) ? value.capabilities.map(String).filter(Boolean).slice(0, 4) : []
  const protocols = Array.isArray(value.supportedProtocols) ? value.supportedProtocols.map(String).filter(Boolean).slice(0, 3) : []
  const evidence = [...capabilities, ...protocols]
  return evidence.length ? `${category} agent focused on ${evidence.join(', ')} based on its registered capabilities and protocols.` : `${category} agent with metadata available from the ERC-8004 registry; detailed capabilities were not published.`
}

export function parseMetadata(input: unknown): Erc8004Metadata {
  if (!input || typeof input !== 'object') return {}
  const value = input as Record<string, unknown>
  const list = (key: string) => Array.isArray(value[key]) ? value[key].map(String).filter(Boolean) : undefined
  const category = evidenceCategory(value)
  return { ...value, name: typeof value.name === 'string' ? value.name : undefined, description: evidenceDescription(value, category), category, capabilities: list('capabilities'), supportedProtocols: list('supportedProtocols'), endpoint: typeof value.endpoint === 'string' ? value.endpoint : undefined, ownerAddress: typeof value.ownerAddress === 'string' ? value.ownerAddress : undefined }
}

/**
 * Every agent the index reports for the configured chain.
 *
 * This deliberately does NOT filter by a hardcoded registry address. BNB Chain has
 * multiple ERC-8004 registry deployments, and filtering to one built-in address
 * silently discarded every agent registered anywhere else — which looked exactly like
 * "the registry returned nothing".
 */
export async function discoverIdentities(): Promise<Erc8004Identity[]> {
  const result = await enumerateAllAgents()
  const chainId = getBnbConfig().chainId
  return result.identities.filter((item) => !item.chainId || item.chainId === chainId)
}

export async function readRegistration(identity: Erc8004Identity): Promise<Erc8004Registration> {
  if (identity.scanRecord) return normalizeRegistration(identity, identity.scanRecord)
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
  const nested = [row.metadata, row.agent, row.data].find((value) => value && typeof value === 'object') as Record<string, unknown> | undefined
  const metadata = parseMetadata({
    ...(nested || {}),
    name: row.name ?? row.agent_name ?? row.agentName ?? nested?.name,
    description: row.description ?? row.agent_description ?? row.agentDescription ?? nested?.description,
    category: row.category ?? row.agent_category ?? row.agentCategory ?? nested?.category,
    image: row.image_url ?? row.image ?? nested?.image,
    capabilities: row.capabilities ?? row.capability_items ?? nested?.capabilities,
    supportedProtocols: row.supported_protocols ?? row.supportedProtocols ?? nested?.supportedProtocols,
    endpoint: row.endpoint ?? row.agent_endpoint ?? nested?.endpoint,
    ownerAddress: row.owner_address ?? row.ownerAddress ?? row.owner ?? nested?.ownerAddress,
  })
  return {
    ...identity,
    metadataUri: String(row.metadataUri || row.agentURI || row.agent_uri || row.uri || metadata.metadataUri || ''),
    metadataHash: typeof row.metadataHash === 'string' ? row.metadataHash : undefined,
    ownerAddress: String(row.ownerAddress || row.owner_address || row.owner || metadata.ownerAddress || ''),
    status: row.status === 'Paused' || row.status === 'Beta' ? row.status : 'Live',
    raw: row,
  }
}

const IPFS_GATEWAY = process.env.IPFS_GATEWAY_URL?.trim() || 'https://ipfs.io/ipfs/'

function resolveMetadataUrl(uri: string): URL | null {
  try {
    const parsed = new URL(uri)
    if (parsed.protocol === 'https:') return parsed
    // IPFS is extremely common for agent metadata; resolve it through a gateway
    // instead of refusing it.
    if (parsed.protocol === 'ipfs:') {
      const path = uri.replace(/^ipfs:\/\/(ipfs\/)?/, '')
      return new URL(`${IPFS_GATEWAY.replace(/\/$/, '')}/${path}`)
    }
    return null
  } catch {
    return null
  }
}

export type MetadataLoad = { data: Erc8004Metadata; hash: string; ok: boolean; reason?: string }

/**
 * Fetches agentURI metadata. This NEVER throws.
 *
 * At registry scale a large share of agents publish metadata that is unreachable,
 * rate-limited, or malformed. Throwing here previously discarded the entire agent,
 * so a broken metadata host could erase most of the catalog. An agent's on-chain
 * identity is valid evidence on its own, so a metadata failure degrades the record
 * rather than dropping it.
 */
export async function loadMetadata(uri: string): Promise<MetadataLoad> {
  const empty = { data: {} as Erc8004Metadata, hash: createHash('sha256').update('{}').digest('hex') }
  if (!uri) return { ...empty, ok: false, reason: 'No metadata URI published' }

  const url = resolveMetadataUrl(uri)
  if (!url) return { ...empty, ok: false, reason: 'Unsupported metadata URI scheme' }

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000), headers: { accept: 'application/json' } })
    if (!response.ok) return { ...empty, ok: false, reason: `Metadata host returned ${response.status}` }
    const text = await response.text()
    try {
      return { data: parseMetadata(JSON.parse(text)), hash: createHash('sha256').update(text).digest('hex'), ok: true }
    } catch {
      return { ...empty, ok: false, reason: 'Metadata is not valid JSON' }
    }
  } catch (error) {
    const reason = error instanceof Error && error.name === 'TimeoutError' ? 'Metadata host timed out' : 'Metadata host unreachable'
    return { ...empty, ok: false, reason }
  }
}
