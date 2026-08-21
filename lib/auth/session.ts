/**
 * Stateless, HMAC-signed authentication cookie.
 *
 * The cookie proves one thing: the bearer completed a wallet signature challenge for
 * address X. It carries no capability of its own — Guard still re-checks session
 * ownership, permissions, and caps on every action.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const AUTH_COOKIE = 'kymera_session'
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000

let devSecret: string | null = null

function secret() {
  const configured = process.env.KYMERA_AUTH_SECRET?.trim()
  if (configured && configured.length >= 32) return configured
  if (process.env.NODE_ENV === 'production') {
    throw new Error('KYMERA_AUTH_SECRET must be set to a random string of at least 32 characters in production')
  }
  // Development fallback: ephemeral per-process secret. Restarting the dev server
  // invalidates sessions, which is the safe failure mode.
  if (!devSecret) devSecret = randomBytes(32).toString('hex')
  return devSecret
}

function b64url(input: string | Buffer) {
  return Buffer.from(input).toString('base64url')
}

function sign(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

export type AuthPayload = { address: string; issuedAt: number; expiresAt: number }

export function issueSessionToken(address: string, ttlMs = SESSION_TTL_MS): { token: string; expiresAt: Date } {
  const now = Date.now()
  const payload: AuthPayload = { address: address.toLowerCase(), issuedAt: now, expiresAt: now + ttlMs }
  const encoded = b64url(JSON.stringify(payload))
  return { token: `${encoded}.${sign(encoded)}`, expiresAt: new Date(payload.expiresAt) }
}

export function readSessionToken(token: string | undefined | null): AuthPayload | null {
  if (!token || typeof token !== 'string') return null
  const separator = token.lastIndexOf('.')
  if (separator <= 0) return null
  const encoded = token.slice(0, separator)
  const signature = token.slice(separator + 1)

  let expected: string
  try { expected = sign(encoded) } catch { return null }

  const given = Buffer.from(signature)
  const want = Buffer.from(expected)
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as AuthPayload
    if (typeof payload.address !== 'string' || typeof payload.expiresAt !== 'number') return null
    if (!/^0x[a-f0-9]{40}$/.test(payload.address)) return null
    if (payload.expiresAt <= Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
  }
}
