/**
 * Authentication tests. The cookie is the only thing standing between a request and
 * another user's wallet-scoped data, so tampering with it must always fail closed.
 */

import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { issueSessionToken, readSessionToken } from '@/lib/auth/session'
import { buildSiweMessage, issueNonce, verifySiwe } from '@/lib/auth/siwe'
import { prisma, resetDatabase } from './helpers/db'

const ADDRESS = '0x1111111111111111111111111111111111111111'

describe('Auth session token', () => {
  test('round-trips a valid token', () => {
    const { token } = issueSessionToken(ADDRESS)
    const payload = readSessionToken(token)
    assert.equal(payload?.address, ADDRESS.toLowerCase())
  })

  test('rejects a tampered payload', () => {
    const { token } = issueSessionToken(ADDRESS)
    const [encoded, signature] = token.split('.')
    const forged = Buffer.from(JSON.stringify({
      address: '0x2222222222222222222222222222222222222222',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 100000,
    })).toString('base64url')
    // Swapping the address while keeping the original signature must not verify.
    assert.equal(readSessionToken(`${forged}.${signature}`), null)
    assert.ok(encoded)
  })

  test('rejects a tampered signature', () => {
    const { token } = issueSessionToken(ADDRESS)
    const [encoded] = token.split('.')
    assert.equal(readSessionToken(`${encoded}.notavalidsignature`), null)
  })

  test('rejects an expired token', () => {
    const { token } = issueSessionToken(ADDRESS, -1000)
    assert.equal(readSessionToken(token), null)
  })

  test('rejects malformed input', () => {
    assert.equal(readSessionToken(''), null)
    assert.equal(readSessionToken(undefined), null)
    assert.equal(readSessionToken('garbage'), null)
    assert.equal(readSessionToken('a.b.c'), null)
  })
})

describe('SIWE verification', () => {
  after(async () => { await prisma.$disconnect() })

  test('builds a message that binds address, nonce, chain, and time', () => {
    const message = buildSiweMessage({
      domain: 'kymera.test', address: ADDRESS, uri: 'https://kymera.test', chainId: 97,
      nonce: 'a'.repeat(32), issuedAt: '2026-01-01T00:00:00.000Z',
    })
    assert.match(message, /kymera\.test wants you to sign in/)
    assert.match(message, new RegExp(ADDRESS))
    assert.match(message, /Chain ID: 97/)
    assert.match(message, /Nonce: a{32}/)
    assert.match(message, /cannot move funds/)
  })

  test('rejects an invalid signature format without consuming a nonce', async () => {
    await resetDatabase()
    const { nonce } = await issueNonce(ADDRESS)
    const result = await verifySiwe({
      address: ADDRESS, signature: 'not-hex', nonce, issuedAt: new Date().toISOString(),
      chainId: 97, domain: 'kymera.test', uri: 'https://kymera.test',
    })
    assert.equal(result.ok, false)
    const stored = await prisma.authNonce.findUnique({ where: { nonce } })
    assert.equal(stored?.consumedAt, null, 'a malformed request must not burn the nonce')
  })

  test('rejects an unknown nonce', async () => {
    await resetDatabase()
    const result = await verifySiwe({
      address: ADDRESS, signature: '0xdeadbeef', nonce: 'b'.repeat(32), issuedAt: new Date().toISOString(),
      chainId: 97, domain: 'kymera.test', uri: 'https://kymera.test',
    })
    assert.equal(result.ok, false)
    assert.equal(result.ok === false && result.error, 'NONCE_INVALID_OR_USED')
  })

  test('a nonce cannot be reused', async () => {
    await resetDatabase()
    const { nonce } = await issueNonce(ADDRESS)
    const attempt = {
      address: ADDRESS, signature: '0xdeadbeef', nonce, issuedAt: new Date().toISOString(),
      chainId: 97, domain: 'kymera.test', uri: 'https://kymera.test',
    }
    // The first attempt consumes the nonce even though the signature is wrong.
    await verifySiwe(attempt)
    const second = await verifySiwe(attempt)
    assert.equal(second.ok, false)
    assert.equal(second.ok === false && second.error, 'NONCE_INVALID_OR_USED')
  })

  test('rejects a stale issuedAt', async () => {
    await resetDatabase()
    const { nonce } = await issueNonce(ADDRESS)
    const result = await verifySiwe({
      address: ADDRESS, signature: '0xdeadbeef', nonce,
      issuedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      chainId: 97, domain: 'kymera.test', uri: 'https://kymera.test',
    })
    assert.equal(result.ok, false)
    assert.equal(result.ok === false && result.error, 'ISSUED_AT_OUT_OF_RANGE')
  })

  test('rejects a malformed address', async () => {
    const result = await verifySiwe({
      address: 'nope', signature: '0xdeadbeef', nonce: 'c'.repeat(32), issuedAt: new Date().toISOString(),
      chainId: 97, domain: 'kymera.test', uri: 'https://kymera.test',
    })
    assert.equal(result.ok, false)
    assert.equal(result.ok === false && result.error, 'INVALID_ADDRESS')
  })
})
