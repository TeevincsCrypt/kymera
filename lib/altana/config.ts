/**
 * Altana network + credential configuration. Server-only.
 *
 * Custody model: Kymera holds ONE dedicated admin key for the Altana smart agentic
 * wallet. It never reaches the browser, is never written to Prisma, is never returned
 * by an API route, and is never logged. Session keys are not stored at all — they are
 * derived deterministically from the admin key and the session id (see deriveSessionKey),
 * so a database dump contains no signing material.
 */

import { createHmac } from 'node:crypto'
import { BNB, BNB_TESTNET, type NetworkConfig } from '@altananetwork/sdk'
import type { Hex } from 'viem'
import { BSC_MAINNET_CHAIN_ID, BSC_TESTNET_CHAIN_ID, mainnetEnabled } from '@/lib/guard/policy'

export const ALTANA_PROVIDER = 'ALTANA'

export type AltanaStatus = {
  /** True only when a signer is configured AND the requested network is permitted. */
  available: boolean
  /** Machine-readable reason when unavailable. Shown to users verbatim, never invented. */
  reason?: string
  network: 'bnb-testnet' | 'bnb'
  chainId: number
  relayUrl?: string
  explorer: string
}

const NETWORKS: Record<'bnb-testnet' | 'bnb', NetworkConfig> = {
  'bnb-testnet': BNB_TESTNET,
  bnb: BNB,
}

function requestedNetwork(): 'bnb-testnet' | 'bnb' {
  const raw = process.env.ALTANA_NETWORK?.trim().toLowerCase()
  return raw === 'bnb' || raw === 'bnb-mainnet' ? 'bnb' : 'bnb-testnet'
}

/** The Altana network config for a chain id, or null if Kymera does not allow that chain. */
export function altanaNetworkFor(chainId: number): NetworkConfig | null {
  if (chainId === BSC_TESTNET_CHAIN_ID) return BNB_TESTNET
  if (chainId === BSC_MAINNET_CHAIN_ID && mainnetEnabled()) return BNB
  return null
}

function adminPrivateKey(): Hex | null {
  const raw = process.env.ALTANA_ADMIN_PRIVATE_KEY?.trim()
  if (!raw) return null
  const hex = raw.startsWith('0x') ? raw : `0x${raw}`
  return /^0x[0-9a-fA-F]{64}$/.test(hex) ? (hex as Hex) : null
}

/**
 * The admin key, or null. Callers MUST NOT include the return value in any response,
 * log line, error message, or database write.
 */
export function altanaAdminKey(): Hex | null {
  return adminPrivateKey()
}

/**
 * Session signing material, derived rather than stored. Deterministic for a given
 * session id, so a session granted today can be resumed tomorrow without Kymera ever
 * persisting a private key.
 */
export function deriveSessionKey(sessionId: string): Hex | null {
  const admin = adminPrivateKey()
  if (!admin) return null
  const digest = createHmac('sha256', Buffer.from(admin.slice(2), 'hex')).update(`altana-session:${sessionId}`).digest('hex')
  return `0x${digest}` as Hex
}

export function altanaStatus(): AltanaStatus {
  const network = requestedNetwork()
  const config = NETWORKS[network]
  const base = { network, chainId: config.chainId, relayUrl: config.relayUrl, explorer: config.explorer }

  if (network === 'bnb' && !mainnetEnabled()) {
    return { ...base, available: false, reason: 'ALTANA_MAINNET_DISABLED' }
  }
  if (!adminPrivateKey()) {
    return { ...base, available: false, reason: 'ALTANA_ADMIN_KEY_NOT_CONFIGURED' }
  }
  if (!config.relayUrl) {
    return { ...base, available: false, reason: 'ALTANA_NETWORK_HAS_NO_RELAY' }
  }
  return { ...base, available: true }
}

export const ALTANA_REASON_COPY: Record<string, string> = {
  ALTANA_ADMIN_KEY_NOT_CONFIGURED: 'Altana is not configured on this deployment. Set ALTANA_ADMIN_PRIVATE_KEY on the server to enable smart agentic wallets.',
  ALTANA_MAINNET_DISABLED: 'Altana is configured for BNB mainnet, but mainnet execution is disabled on this deployment.',
  ALTANA_NETWORK_HAS_NO_RELAY: 'No Altana relay serves the configured network, so sessions cannot execute there.',
  ALTANA_CHAIN_NOT_SUPPORTED: 'Altana sessions are not available on this chain.',
  ALTANA_RELAY_UNREACHABLE: 'The Altana relay could not be reached. No session was granted and nothing was executed.',
  ALTANA_SESSION_NOT_GRANTED: 'This session has no Altana delegation, so it cannot execute through an agent wallet.',
  ALTANA_SESSION_EXPIRED: 'The Altana session key has expired. Grant a new session to continue.',
  ALTANA_SESSION_REVOKED: 'The Altana session key was revoked on-chain and can no longer act.',
}

export function altanaReasonCopy(reason: string) {
  return ALTANA_REASON_COPY[reason] ?? reason
}
