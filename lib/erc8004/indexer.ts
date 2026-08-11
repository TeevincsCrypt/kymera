import { prisma } from '@/lib/prisma'
import { discoverIdentities, getBnbConfig, loadMetadata, readRegistration, type Erc8004Identity } from './adapter'

export type SyncStats = { scanned: number; imported: number; updated: number; failed: number; errors: string[] }

export async function upsertRegistration(identity: Erc8004Identity) {
  const registration = await readRegistration(identity)
  const metadata = await loadMetadata(registration.metadataUri)
  const data = {
    name: metadata.data.name || `ERC-8004 Agent ${identity.tokenId}`,
    description: metadata.data.description || 'Registered autonomous agent.',
    category: metadata.data.category || 'Research',
    chain: 'BNB Chain',
    endpoint: metadata.data.endpoint || null,
    ownerAddress: registration.ownerAddress || metadata.data.ownerAddress || 'unknown',
    registrationId: identity.tokenId,
    capabilities: metadata.data.capabilities || [],
    supportedProtocols: metadata.data.supportedProtocols || [],
    verified: true,
    status: registration.status,
    erc8004ChainId: identity.chainId,
    erc8004RegistryAddress: identity.registryAddress,
    erc8004TokenId: identity.tokenId,
    erc8004MetadataUri: registration.metadataUri,
    erc8004MetadataHash: registration.metadataHash || metadata.hash,
    erc8004LastSyncedAt: new Date(),
    erc8004RawRegistration: registration.raw,
  }
  const existing = await prisma.agent.findFirst({ where: { erc8004ChainId: identity.chainId, erc8004RegistryAddress: identity.registryAddress, erc8004TokenId: identity.tokenId }, select: { id: true } })
  return existing
    ? prisma.agent.update({ where: { id: existing.id }, data })
    : prisma.agent.create({ data })
}

export async function syncErc8004(ids?: Erc8004Identity[]) : Promise<SyncStats> {
  const identities = ids ?? await discoverIdentities()
  const stats: SyncStats = { scanned: identities.length, imported: 0, updated: 0, failed: 0, errors: [] }
  for (const identity of identities) {
    try {
      const existing = await prisma.agent.findFirst({ where: { erc8004ChainId: identity.chainId, erc8004RegistryAddress: identity.registryAddress, erc8004TokenId: identity.tokenId }, select: { id: true } })
      await upsertRegistration(identity)
      if (existing) stats.updated += 1
      else stats.imported += 1
    }
    catch (error) { stats.failed += 1; stats.errors.push(error instanceof Error ? error.message : 'Unknown sync error') }
  }
  return stats
}

export function getIndexerConfig() {
  return { ...getBnbConfig(), configured: Boolean(process.env.ERC8004_REGISTRATIONS_JSON || process.env.ERC8004_INDEXER_URL) }
}
