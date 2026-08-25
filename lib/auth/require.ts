/**
 * Route-level authentication helper.
 *
 * Every wallet-scoped API route must derive the acting wallet from here. Reading an
 * address out of the request body or query string is what allowed one wallet to read
 * and mutate another's records, and is not permitted anywhere in this codebase.
 */

import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { AUTH_COOKIE, readSessionToken } from './session'

export async function authenticatedWallet(): Promise<string | null> {
  try {
    const store = await cookies()
    const payload = readSessionToken(store.get(AUTH_COOKIE)?.value)
    return payload?.address ?? null
  } catch {
    return null
  }
}

export function unauthorized(detail = 'Sign in with your wallet to continue.') {
  return NextResponse.json({ error: detail, code: 'NOT_AUTHENTICATED' }, { status: 401 })
}

export function forbidden(detail = 'This resource belongs to a different wallet.') {
  return NextResponse.json({ error: detail, code: 'FORBIDDEN' }, { status: 403 })
}

/**
 * Resolves the authenticated wallet or returns a 401 response to hand straight back
 * to the client. Usage: `const auth = await requireWallet(); if ('response' in auth) return auth.response`
 */
export async function requireWallet(): Promise<{ address: string } | { response: NextResponse }> {
  const address = await authenticatedWallet()
  if (!address) return { response: unauthorized() }
  return { address }
}
