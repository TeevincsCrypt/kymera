import { BNB, createClient, signerFromPrivateKey } from '@altananetwork/sdk'
import type { Address, Hex } from 'viem'

export type AltanaSessionGrant = {
  walletAddress: Address
  publicKey: Hex
  expiry: number
  transactionHash?: Hex
  providerSessionId: string
  verificationUrl?: string
  network: string
}

export type AltanaStatus = { configured: boolean; network: string; reason?: string }

function privateKey() {
  const value = process.env.ALTANA_PRIVATE_KEY?.trim()
  return value && /^0x[0-9a-fA-F]{64}$/.test(value) ? value as Hex : null
}

export function getAltanaStatus(): AltanaStatus {
  return privateKey() ? { configured: true, network: 'BNB Smart Chain' } : { configured: false, network: 'BNB Smart Chain', reason: 'ALTANA_PRIVATE_KEY is not configured; using simulation mode.' }
}

export async function grantAltanaSession(input: { expiry: Date; spendLimit?: number; permissions: string[] }): Promise<AltanaSessionGrant> {
  const key = privateKey()
  if (!key) throw new Error('Altana provider is not configured')
  const client = createClient({ chains: [BNB], defaultChainId: 56 })
  const signer = signerFromPrivateKey(key)
  const wallet = await client.createWallet({ signer })
  const result = await client.grantSession({ wallet, signer, expiry: Math.floor(input.expiry.getTime() / 1000), register: true, permissions: { spend: input.spendLimit && input.spendLimit > 0 ? [{ limit: BigInt(Math.round(input.spendLimit * 1e18)), period: 'day' }] : undefined } })
  const tx = result.transactionHash
  return { walletAddress: result.walletAddress, publicKey: result.publicKey, expiry: result.expiry, transactionHash: tx, providerSessionId: result.publicKey, verificationUrl: tx ? `${BNB.explorer}/tx/${tx}` : undefined, network: 'BNB Smart Chain' }
}

export async function revokeAltanaSession() {
  throw new Error('Altana revocation requires the persisted wallet signer and session object; no destructive operation was attempted.')
}

export async function verifyAltanaSession() {
  return { verified: false, reason: 'Verification requires a persisted Altana session key and onchain reference.' }
}
