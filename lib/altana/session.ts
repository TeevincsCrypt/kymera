/**
 * Altana session lifecycle: grant, resume, verify, revoke.
 *
 * A Kymera Guard session and an Altana session key describe the same delegation at two
 * depths. Guard decides whether an action is permitted and builds the calldata; the
 * Altana account contract enforces the same allowlist and spend cap on-chain, so the
 * delegation holds even if Kymera's server is wrong or compromised.
 *
 * Session signing material is never persisted — it is re-derived from the admin key and
 * the Guard session id whenever a session is resumed. A database dump contains no keys.
 */

import { registerSessionKey, signerFromPrivateKey, type Session } from '@altananetwork/sdk'
import type { Address, Hex } from 'viem'
import { prisma } from '@/lib/prisma'
import { ALTANA_PROVIDER, deriveSessionKey } from './config'
import { altanaFor, describe, ensureAltanaWallet } from './client'
import { buildAltanaPermissions } from './permissions'

export type AltanaSessionRow = {
  id: string
  chainId: number
  expiresAt: Date
  status: string
  spendingLimit: unknown
  provider: string
  walletAddress: string | null
  providerSessionId: string | null
  network: string | null
  grantTxHash: string | null
  verificationUrl: string | null
}

export type AltanaGrant =
  | { ok: true; walletAddress: Address; publicKey: Hex; txHash?: Hex; explorerUrl?: string; protocols: string[]; methods: string[] }
  | { ok: false; reason: string; detail?: string }

/**
 * Delegate an existing Guard session to an Altana session key, on-chain.
 *
 * Called after the Guard session row exists, so the session id is stable and the derived
 * session key is reproducible. Failure leaves the Guard session untouched and fully
 * usable — Altana delegation is an upgrade to a session, never a precondition for one.
 */
export async function grantAltanaSession(session: {
  id: string
  chainId: number
  expiresAt: Date
  spendingLimit?: number | null
  permissions: readonly string[]
}): Promise<AltanaGrant> {
  const resolved = altanaFor(session.chainId)
  if (!resolved.ok) return { ok: false, reason: resolved.reason }

  const sessionKey = deriveSessionKey(session.id)
  if (!sessionKey) return { ok: false, reason: 'ALTANA_ADMIN_KEY_NOT_CONFIGURED' }

  const provisioned = await ensureAltanaWallet(session.chainId)
  if (!provisioned.ok) return { ok: false, reason: provisioned.reason, detail: provisioned.detail }

  const built = buildAltanaPermissions({
    chainId: session.chainId,
    permissions: session.permissions,
    spendingLimit: session.spendingLimit,
    expiresAt: session.expiresAt,
  })

  try {
    const granted = await resolved.client.grantSession({
      wallet: { address: provisioned.address },
      signer: resolved.adminSigner,
      chainId: session.chainId,
      sessionSigner: signerFromPrivateKey(sessionKey),
      permissions: built.permissions,
      expiry: Math.floor(session.expiresAt.getTime() / 1000),
      // Registered so any third party — including the hackathon's verification tooling —
      // can read this session's authority, expiry, and revocation state on-chain.
      register: true,
    })

    const explorerUrl = granted.transactionHash ? `${resolved.network.explorer}/tx/${granted.transactionHash}` : undefined

    await prisma.agentSession.update({
      where: { id: session.id },
      data: {
        provider: ALTANA_PROVIDER,
        walletAddress: provisioned.address,
        providerSessionId: granted.publicKey,
        network: resolved.network.chain.name,
        grantTxHash: granted.transactionHash ?? null,
        verificationUrl: explorerUrl ?? null,
      },
    })

    return {
      ok: true,
      walletAddress: provisioned.address,
      publicKey: granted.publicKey,
      txHash: granted.transactionHash,
      explorerUrl,
      protocols: built.protocols,
      methods: built.methods,
    }
  } catch (error) {
    return { ok: false, reason: 'ALTANA_RELAY_UNREACHABLE', detail: describe(error) }
  }
}

/**
 * Rebuild the SDK Session for a stored Guard session, so an agent can execute with it.
 * Returns null when the session was never delegated to Altana.
 */
export function resumeAltanaSession(row: AltanaSessionRow, permissions: readonly string[]): Session | null {
  if (row.provider !== ALTANA_PROVIDER || !row.walletAddress || !row.providerSessionId) return null
  const sessionKey = deriveSessionKey(row.id)
  if (!sessionKey) return null

  const built = buildAltanaPermissions({
    chainId: row.chainId,
    permissions,
    spendingLimit: row.spendingLimit == null ? null : Number(row.spendingLimit),
    expiresAt: row.expiresAt,
  })

  return {
    walletAddress: row.walletAddress as Address,
    signer: signerFromPrivateKey(sessionKey),
    publicKey: row.providerSessionId as Hex,
    permissions: built.permissions,
    expiry: Math.floor(row.expiresAt.getTime() / 1000),
  }
}

export type AltanaRevocation = { ok: true; txHash?: Hex } | { ok: false; reason: string; detail?: string }

/**
 * Revoke the on-chain delegation. Kymera's own revocation (marking the Guard session
 * REVOKED) is what stops Kymera from authorizing anything further and happens first;
 * this removes the key's authority at the account contract as well, so the delegation is
 * dead even for anyone holding the session key directly.
 */
export async function revokeAltanaSession(row: AltanaSessionRow): Promise<AltanaRevocation> {
  if (row.provider !== ALTANA_PROVIDER || !row.walletAddress || !row.providerSessionId) {
    return { ok: false, reason: 'ALTANA_SESSION_NOT_GRANTED' }
  }
  const resolved = altanaFor(row.chainId)
  if (!resolved.ok) return { ok: false, reason: resolved.reason }

  try {
    const result = await resolved.client.revokeSession({
      wallet: { address: row.walletAddress as Address },
      signer: resolved.adminSigner,
      session: row.providerSessionId as Hex,
      chainId: row.chainId,
    })
    return { ok: true, txHash: result.transactionHash }
  } catch (error) {
    return { ok: false, reason: 'ALTANA_RELAY_UNREACHABLE', detail: describe(error) }
  }
}

export type AltanaVerification = {
  delegated: boolean
  reason?: string
  walletAddress?: string
  publicKey?: string
  expiresAt?: string
  grantTxHash?: string
  explorerUrl?: string
  /** True only when the key was confirmed registered in the on-chain KeyStore. */
  registeredOnChain?: boolean
  detail?: string
}

/**
 * Confirm the delegation on-chain. `registerSessionKey` is idempotent and reports
 * `alreadyRegistered` when the key is present and valid in the KeyStore, which is
 * exactly the read we want — so a verification never claims more than the chain says.
 */
export async function verifyAltanaSession(row: AltanaSessionRow, permissions: readonly string[]): Promise<AltanaVerification> {
  const session = resumeAltanaSession(row, permissions)
  if (!session) return { delegated: false, reason: 'ALTANA_SESSION_NOT_GRANTED' }
  if (row.status !== 'Active') return { delegated: false, reason: 'ALTANA_SESSION_REVOKED' }
  if (row.expiresAt.getTime() <= Date.now()) return { delegated: false, reason: 'ALTANA_SESSION_EXPIRED' }

  const resolved = altanaFor(row.chainId)
  if (!resolved.ok) return { delegated: false, reason: resolved.reason }

  const base: AltanaVerification = {
    delegated: true,
    walletAddress: row.walletAddress ?? undefined,
    publicKey: row.providerSessionId ?? undefined,
    expiresAt: row.expiresAt.toISOString(),
    grantTxHash: row.grantTxHash ?? undefined,
    explorerUrl: row.verificationUrl ?? undefined,
  }

  try {
    const result = await registerSessionKey({ address: session.walletAddress }, resolved.adminSigner, session, { network: resolved.network })
    return { ...base, registeredOnChain: result.alreadyRegistered || result.status !== 'FAILED' }
  } catch (error) {
    // The grant itself still stands; only the on-chain confirmation could not be read.
    return { ...base, registeredOnChain: undefined, reason: 'ALTANA_RELAY_UNREACHABLE', detail: describe(error) }
  }
}
