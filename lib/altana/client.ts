/**
 * Altana SDK client construction. Server-only.
 *
 * Every function here is a thin, honest wrapper: when Altana is not configured or the
 * relay cannot be reached, it returns a machine-readable reason rather than pretending
 * an operation happened. Nothing in this file decides policy — Guard does that first,
 * and Altana only ever executes calldata Guard already approved.
 */

import { createClient, signerFromPrivateKey, type Client, type NetworkConfig, type Signer } from '@altananetwork/sdk'
import type { Address } from 'viem'
import { altanaAdminKey, altanaNetworkFor, altanaStatus } from './config'

export type AltanaUnavailable = { ok: false; reason: string; detail?: string }
export type AltanaReady = { ok: true; client: Client; network: NetworkConfig; adminSigner: Signer; walletAddress: Address }

const clients = new Map<number, Client>()

function clientFor(network: NetworkConfig): Client {
  const cached = clients.get(network.chainId)
  if (cached) return cached
  const client = createClient({ chains: [network], defaultChainId: network.chainId })
  clients.set(network.chainId, client)
  return client
}

/**
 * Resolve everything needed to talk to Altana on a chain, or explain why we cannot.
 *
 * The wallet address is derived from the admin signer offline — for private-key signers
 * the smart-account address IS the signer address (EIP-7702) — so this never makes a
 * network call and is safe to use from a status endpoint.
 */
export function altanaFor(chainId: number): AltanaReady | AltanaUnavailable {
  const status = altanaStatus()
  if (!status.available) return { ok: false, reason: status.reason ?? 'ALTANA_UNAVAILABLE' }

  const network = altanaNetworkFor(chainId)
  if (!network) return { ok: false, reason: 'ALTANA_CHAIN_NOT_SUPPORTED' }

  const key = altanaAdminKey()
  if (!key) return { ok: false, reason: 'ALTANA_ADMIN_KEY_NOT_CONFIGURED' }

  const adminSigner = signerFromPrivateKey(key)
  return { ok: true, client: clientFor(network), network, adminSigner, walletAddress: adminSigner.address }
}

/**
 * Provision the agent wallet with the relay. Counterfactual — no on-chain transaction
 * and no funds move; the smart account is registered on first execute. Idempotent.
 */
export async function ensureAltanaWallet(chainId: number) {
  const resolved = altanaFor(chainId)
  if (!resolved.ok) return resolved
  try {
    const wallet = await resolved.client.createWallet({ signer: resolved.adminSigner })
    return { ok: true as const, address: wallet.address, network: resolved.network }
  } catch (error) {
    return { ok: false as const, reason: 'ALTANA_RELAY_UNREACHABLE', detail: describe(error) }
  }
}

/** Error text safe to surface: never includes key material, which the SDK does not carry in messages. */
export function describe(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
