export type DiscoveryIntent = {
  mode: 'task' | 'browse'
  raw: string
  task?: string
  category?: string
  capabilities: string[]
  protocols: string[]
  chain?: string
  risk?: 'low' | 'medium' | 'high'
  terms: string[]
}

// Must match the marketplace's category set, otherwise a detected category filters
// the query down to nothing.
const categories = ['Trading', 'DeFi', 'Research', 'Analytics', 'Monitoring', 'Security', 'Operations', 'Creative']
const protocols = ['ERC-8004', 'A2A', 'MCP', 'x402', 'PancakeSwap', 'PancakeSwap V3']
const capabilityMap: Record<string, string[]> = {
  yield: ['yield', 'risk', 'trading', 'liquidity'],
  monitoring: ['monitoring', 'monitor', 'alerts', 'watch'],
  security: ['security', 'guard', 'audit', 'permissions'],
  research: ['research', 'market', 'sources', 'signals', 'data'],
  support: ['support', 'triage', 'crm', 'customer'],
  copy: ['copy', 'creative', 'brand', 'editorial'],
  operations: ['routing', 'automation', 'sla', 'operations'],
  pancakeswap: ['pancakeswap', 'pancake swap', 'liquidity', 'pool', 'swap', 'amm'],
}

export function interpretQuery(input: string): DiscoveryIntent {
  const raw = input.trim()
  const lower = raw.toLowerCase()
  const category = categories.find((item) => lower.includes(item.toLowerCase()))
  const protocol = protocols.find((item) => lower.includes(item.toLowerCase()))
  const capabilities = Object.entries(capabilityMap).filter(([key, values]) => lower.includes(key) || values.some((value) => lower.includes(value))).flatMap(([, values]) => values)
  const risk = lower.includes('low risk') || lower.includes('safe') ? 'low' : lower.includes('high risk') || lower.includes('aggressive') ? 'high' : undefined
  const focused = Boolean(category || capabilities.length || protocol || risk || lower.includes('bnb') || lower.includes('bsc'))
  const task = lower.includes('find') || lower.includes('need') || lower.includes('looking') || lower.includes('best') || focused ? raw : undefined
  const stopwords = ['find', 'with', 'that', 'for', 'the', 'and', 'from', 'best', 'any', 'all', 'agent', 'agents', 'need', 'want', 'looking', 'help', 'can', 'you', 'show', 'top']
  const terms = lower.split(/[^a-z0-9-]+/).filter((term) => term.length > 1 && !stopwords.includes(term))
  return { mode: task ? 'task' : 'browse', raw, task, category, capabilities: [...new Set(capabilities)], protocols: protocol ? [protocol] : [], chain: lower.includes('bnb') || lower.includes('bsc') ? 'BNB Chain' : undefined, risk, terms }
}
