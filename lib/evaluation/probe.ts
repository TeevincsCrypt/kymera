/**
 * Endpoint reachability probe.
 *
 * Agent endpoints come from third-party registry metadata, which means an attacker
 * can publish any URL they like and Kymera's server would fetch it. That is a
 * server-side request forgery vector, so every probe is constrained: HTTPS only, no
 * redirects, resolved IP must be publicly routable, short timeout, and the response
 * body is never read or surfaced.
 */

import { lookup } from 'node:dns/promises'
import net from 'node:net'

const PROBE_TIMEOUT_MS = 5_000

function isPrivateIpv4(ip: string) {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b] = parts
  if (a === 10) return true
  if (a === 127) return true
  if (a === 0) return true
  if (a === 169 && b === 254) return true // link-local, incl. cloud metadata 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a >= 224) return true // multicast + reserved
  return false
}

function isPrivateIpv6(ip: string) {
  const value = ip.toLowerCase()
  if (value === '::1' || value === '::') return true
  if (value.startsWith('fe80') || value.startsWith('fc') || value.startsWith('fd')) return true
  if (value.startsWith('::ffff:')) return isPrivateIpv4(value.slice(7))
  return false
}

export async function isPubliclyRoutable(hostname: string) {
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.internal') || hostname.endsWith('.local')) return false
  if (net.isIP(hostname)) return net.isIP(hostname) === 4 ? !isPrivateIpv4(hostname) : !isPrivateIpv6(hostname)
  try {
    const resolved = await lookup(hostname, { all: true })
    if (!resolved.length) return false
    return resolved.every((entry) => (entry.family === 4 ? !isPrivateIpv4(entry.address) : !isPrivateIpv6(entry.address)))
  } catch {
    return false
  }
}

export type ProbeResult = { reachable: boolean | null; detail: string }

export async function probeEndpoint(endpoint: string | null | undefined): Promise<ProbeResult> {
  if (!endpoint || typeof endpoint !== 'string') return { reachable: null, detail: 'No endpoint published' }

  let url: URL
  try { url = new URL(endpoint) } catch { return { reachable: false, detail: 'Published endpoint is not a valid URL' } }
  if (url.protocol !== 'https:') return { reachable: false, detail: 'Endpoint must use HTTPS' }
  if (!(await isPubliclyRoutable(url.hostname))) return { reachable: false, detail: 'Endpoint does not resolve to a public address' }

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: { accept: 'application/json, */*', 'user-agent': 'Kymera-Evaluator/1.0' },
    })
    // Any HTTP response proves the endpoint is live; the body is deliberately ignored.
    return { reachable: response.status < 500, detail: `Endpoint responded with HTTP ${response.status}` }
  } catch (error) {
    const detail = error instanceof Error && error.name === 'TimeoutError' ? 'Endpoint did not respond within 5s' : 'Endpoint request failed'
    return { reachable: false, detail }
  }
}
