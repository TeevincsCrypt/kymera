import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { checkBnbRuntime, discoverIdentities, evidenceCategory, getBnbConfig, loadMetadata, readRegistration, type Erc8004Identity } from './adapter'
import { evaluateAgent } from '@/lib/evaluation/score'

export type SyncStats = {
  scanned: number
  imported: number
  updated: number
  scored: number
  metadataUnavailable: number
  failed: number
  errors: string[]
}

/** Concurrency for metadata fetches. Registry-scale syncs are network-bound. */
const FETCH_CONCURRENCY = Number(process.env.ERC8004_SYNC_CONCURRENCY || 12)

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size))
  return out
}

/**
 * Builds the database record for one registry identity.
 *
 * The Kymera Score is computed inline from evidence already in hand. Running the full
 * evaluation pipeline per agent would add four queries each, which at registry scale
 * turns a sync into a timeout. Reliability and endpoint signals are unavailable during
 * a sync, so they are correctly reported as "no evidence" rather than guessed.
 */
async function buildAgentData(identity: Erc8004Identity) {
  const registration = await readRegistration(identity)
  const metadata = await loadMetadata(registration.metadataUri)

  const raw = (registration.raw ?? {}) as Record<string, unknown>
  const name = metadata.data.name
    || (typeof raw.name === 'string' ? raw.name : undefined)
    || (typeof raw.agent_name === 'string' ? raw.agent_name : undefined)
    || `Agent #${identity.tokenId}`

  const capabilities = metadata.data.capabilities?.length
    ? metadata.data.capabilities
    : (Array.isArray(raw.capabilities) ? raw.capabilities.map(String) : [])
  const supportedProtocols = metadata.data.supportedProtocols?.length
    ? metadata.data.supportedProtocols
    : (Array.isArray(raw.supported_protocols) ? raw.supported_protocols.map(String) : [])

  const category = evidenceCategory({ ...raw, ...metadata.data, name, capabilities, supportedProtocols })

  const description = metadata.data.description
    || (typeof raw.description === 'string' ? raw.description : '')
    || (capabilities.length
      ? `${category} agent registered on BNB Chain, publishing ${capabilities.slice(0, 4).join(', ')}.`
      : `${category} agent registered on BNB Chain under ERC-8004. ${metadata.reason ?? 'Its registry metadata is not currently readable.'}`)

  const evaluation = evaluateAgent({
    erc8004TokenId: identity.tokenId,
    erc8004RegistryAddress: identity.registryAddress,
    erc8004MetadataUri: registration.metadataUri,
    erc8004MetadataHash: registration.metadataHash || (metadata.ok ? metadata.hash : undefined),
    ownerAddress: registration.ownerAddress,
    name,
    description,
    capabilities,
    supportedProtocols,
    capabilityItemCount: capabilities.length,
    endpoint: metadata.data.endpoint,
  })

  return {
    metadataOk: metadata.ok,
    scored: evaluation.sufficientEvidence,
    data: {
      name,
      description,
      category,
      chain: 'BNB Chain',
      endpoint: metadata.data.endpoint || null,
      ownerAddress: registration.ownerAddress || metadata.data.ownerAddress || 'unknown',
      registrationId: identity.tokenId,
      capabilities,
      supportedProtocols,
      verified: Boolean(identity.tokenId && identity.registryAddress),
      status: registration.status,
      kymeraScore: evaluation.score,
      evaluationStatus: evaluation.sufficientEvidence ? 'EVALUATED' : 'INSUFFICIENT_EVIDENCE',
      kymeraEvaluatedAt: new Date(),
      erc8004ChainId: identity.chainId,
      erc8004RegistryAddress: identity.registryAddress,
      erc8004TokenId: identity.tokenId,
      erc8004MetadataUri: registration.metadataUri,
      erc8004MetadataHash: registration.metadataHash || metadata.hash,
      erc8004LastSyncedAt: new Date(),
      erc8004RawRegistration: JSON.parse(JSON.stringify(registration.raw ?? {})) as Prisma.InputJsonValue,
    },
  }
}

export async function upsertRegistration(identity: Erc8004Identity) {
  const built = await buildAgentData(identity)
  const existing = await prisma.agent.findFirst({
    where: { erc8004ChainId: identity.chainId, erc8004RegistryAddress: identity.registryAddress, erc8004TokenId: identity.tokenId },
    select: { id: true, trustTier: true },
  })

  if (existing) {
    return prisma.agent.update({
      where: { id: existing.id },
      // Never downgrade a human-set VETTED tier during a routine sync.
      data: { ...built.data, trustTier: existing.trustTier === 'VETTED' ? 'VETTED' : built.scored ? 'EVALUATED' : 'INDEXED' },
    })
  }

  const created = await prisma.agent.create({
    data: {
      ...built.data,
      trustTier: built.scored ? 'EVALUATED' : 'INDEXED',
      capabilityItems: { create: built.data.capabilities.slice(0, 24).map((name) => ({ name: String(name).slice(0, 120) })) },
    },
  })
  return created
}

export async function syncErc8004(ids?: Erc8004Identity[]): Promise<SyncStats> {
  const identities = ids ?? (await discoverIdentities())
  const stats: SyncStats = { scanned: identities.length, imported: 0, updated: 0, scored: 0, metadataUnavailable: 0, failed: 0, errors: [] }

  for (const batch of chunk(identities, FETCH_CONCURRENCY)) {
    const results = await Promise.allSettled(
      batch.map(async (identity) => {
        const existing = await prisma.agent.findFirst({
          where: { erc8004ChainId: identity.chainId, erc8004RegistryAddress: identity.registryAddress, erc8004TokenId: identity.tokenId },
          select: { id: true },
        })
        const agent = await upsertRegistration(identity)
        return { wasNew: !existing, agent }
      }),
    )

    for (const result of results) {
      if (result.status === 'rejected') {
        stats.failed += 1
        const message = result.reason instanceof Error ? result.reason.message : 'Unknown sync error'
        if (stats.errors.length < 10 && !stats.errors.includes(message)) stats.errors.push(message)
        continue
      }
      if (result.value.wasNew) stats.imported += 1
      else stats.updated += 1
      if (result.value.agent.kymeraScore !== null) stats.scored += 1
      if (!result.value.agent.erc8004MetadataUri) stats.metadataUnavailable += 1
    }
  }

  return stats
}

export async function getIndexerStatus() {
  const config = getIndexerConfig()
  try {
    const runtime = await checkBnbRuntime()
    return { ...config, rpcChainId: runtime.chainId, blockNumber: runtime.blockNumber, registryStatus: runtime.registryStatus, rpcReachable: true }
  } catch (error) {
    // A failing RPC must not block a sync that only needs the index API.
    return { ...config, rpcChainId: null, blockNumber: null, registryStatus: 'unknown' as const, rpcReachable: false, rpcError: error instanceof Error ? error.message : 'RPC unreachable' }
  }
}

export function getIndexerConfig() {
  return { ...getBnbConfig(), configured: true, source: '8004scan' as const, scanApiUrl: process.env.ERC8004_SCAN_API_URL || 'https://www.8004scan.io/api/v1' }
}
