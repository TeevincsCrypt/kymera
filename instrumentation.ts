/**
 * Startup assertions. These run once per server process, before any request is served.
 *
 * The only thing checked here is that server-only signing material has not been exposed
 * to the browser. `NEXT_PUBLIC_*` variables are inlined into the client bundle at build
 * time, so a private key placed in one is published to every visitor. That is not a
 * misconfiguration to warn about — it is a key compromise, so the process refuses to run.
 */

const NEVER_PUBLIC = ['NEXT_PUBLIC_ALTANA_ADMIN_PRIVATE_KEY', 'NEXT_PUBLIC_KYMERA_AUTH_SECRET']

export function register() {
  const exposed = NEVER_PUBLIC.filter((name) => (process.env[name] ?? '').trim().length > 0)
  if (exposed.length) {
    throw new Error(
      `Refusing to start: ${exposed.join(', ')} would be inlined into the client bundle. ` +
      'Move these to their server-only names and rotate the exposed values.',
    )
  }
}
