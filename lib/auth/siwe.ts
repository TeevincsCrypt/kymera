/**
 * SIWE-style (EIP-4361 shaped) wallet ownership proof.
 *
 * The server issues a single-use nonce, reconstructs the exact message it expects
 * from that nonce, and verifies the signature against that reconstruction. A
 * signature harvested from anywhere else will not match, and a nonce cannot be
 * replayed because it is consumed atomically on first successful use.
 */

import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getServerPublicClient } from '@/lib/web3/server-client'
import { BSC_TESTNET_CHAIN_ID, allowedChainIds, isAddress, normalizeAddress } from '@/lib/guard/policy'
import type { Address, Hex } from 'viem'

export const NONCE_TTL_MS = 10 * 60 * 1000
export const STATEMENT = 'Sign in to Kymera. This proves you control this wallet. It does not create a transaction and cannot move funds.'

export async function issueNonce(address?: string) {
  const nonce = randomBytes(16).toString('hex')
  await prisma.authNonce.create({
    data: {
      nonce,
      address: address && isAddress(address) ? normalizeAddress(address) : null,
      expiresAt: new Date(Date.now() + NONCE_TTL_MS),
    },
  })
  // Opportunistic cleanup so the table cannot grow without bound.
  await prisma.authNonce.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - NONCE_TTL_MS) } } }).catch(() => undefined)
  return { nonce, expiresAt: new Date(Date.now() + NONCE_TTL_MS).toISOString(), statement: STATEMENT }
}

export function buildSiweMessage(input: { domain: string; address: string; uri: string; chainId: number; nonce: string; issuedAt: string }) {
  return [
    `${input.domain} wants you to sign in with your Ethereum account:`,
    input.address,
    '',
    STATEMENT,
    '',
    `URI: ${input.uri}`,
    'Version: 1',
    `Chain ID: ${input.chainId}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt}`,
  ].join('\n')
}

export type VerifyInput = {
  address: string
  signature: string
  nonce: string
  issuedAt: string
  chainId: number
  domain: string
  uri: string
}

export type VerifyResult =
  | { ok: true; address: string }
  | { ok: false; error: string }

export async function verifySiwe(input: VerifyInput): Promise<VerifyResult> {
  const address = normalizeAddress(input.address)
  if (!isAddress(address)) return { ok: false, error: 'INVALID_ADDRESS' }
  if (typeof input.signature !== 'string' || !/^0x[a-fA-F0-9]+$/.test(input.signature)) return { ok: false, error: 'INVALID_SIGNATURE' }
  if (typeof input.nonce !== 'string' || !/^[a-f0-9]{32}$/.test(input.nonce)) return { ok: false, error: 'INVALID_NONCE' }

  const chainId = Number(input.chainId)
  if (!allowedChainIds().includes(chainId) && chainId !== BSC_TESTNET_CHAIN_ID) return { ok: false, error: 'CHAIN_NOT_ALLOWED' }

  const issuedAt = new Date(input.issuedAt)
  if (Number.isNaN(issuedAt.getTime())) return { ok: false, error: 'INVALID_ISSUED_AT' }
  if (Math.abs(Date.now() - issuedAt.getTime()) > NONCE_TTL_MS) return { ok: false, error: 'ISSUED_AT_OUT_OF_RANGE' }

  // Consume the nonce atomically. `updateMany` with a consumedAt guard means a second
  // concurrent attempt with the same nonce updates zero rows and is rejected.
  const consumed = await prisma.authNonce.updateMany({
    where: { nonce: input.nonce, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date(), address },
  })
  if (consumed.count !== 1) return { ok: false, error: 'NONCE_INVALID_OR_USED' }

  const message = buildSiweMessage({
    domain: input.domain,
    address,
    uri: input.uri,
    chainId,
    nonce: input.nonce,
    issuedAt: input.issuedAt,
  })

  try {
    const client = getServerPublicClient(chainId) ?? getServerPublicClient(BSC_TESTNET_CHAIN_ID)
    if (!client) return { ok: false, error: 'VERIFIER_UNAVAILABLE' }
    // `verifyMessage` on a public client covers both EOAs and EIP-1271 smart-contract
    // wallets, so Kymera is not limited to a single wallet family.
    const valid = await client.verifyMessage({ address: address as Address, message, signature: input.signature as Hex })
    if (!valid) return { ok: false, error: 'SIGNATURE_MISMATCH' }
    return { ok: true, address }
  } catch {
    return { ok: false, error: 'VERIFICATION_FAILED' }
  }
}
