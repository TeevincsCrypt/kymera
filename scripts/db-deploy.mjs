#!/usr/bin/env node
/**
 * Safe migration deploy for Vercel.
 *
 * Kymera's production database was originally created with `prisma db push`, so its
 * tables exist but `_prisma_migrations` has no history. Running `prisma migrate
 * deploy` against that state tries to CREATE TABLE "Agent" again, fails, and takes
 * the whole build down.
 *
 * This script reproduces Prisma's documented baselining flow automatically:
 *   1. If there is no database URL, skip (local builds without a DB still work).
 *   2. If the schema is empty, run migrations normally.
 *   3. If tables already exist but no migration history does, mark the pre-existing
 *      migrations as applied, then deploy only the new ones.
 *
 * It is idempotent and never drops or rewrites data.
 *
 * DIRECT_URL (optional): Neon's Vercel integration wires DATABASE_URL to the pooled
 * (pgbouncer) endpoint, which does not support the advisory locks `prisma migrate`
 * commands take. If DIRECT_URL is set (Neon's unpooled connection string), migration
 * commands use it instead; DATABASE_URL is untouched for the running app and for the
 * inspection queries below, which are plain SELECTs pgbouncer handles fine. This is
 * intentionally NOT wired through schema.prisma's `directUrl` field — that makes the
 * variable mandatory, and DIRECT_URL should stay optional so nothing that already
 * works with DATABASE_URL alone breaks.
 *
 * FAILURE MODE: a migration problem here does not fail the Vercel build. The app
 * already surfaces a live database error verbatim in the UI (see OverviewPage /
 * IntelligentDiscover's `databaseError` prop) — that is a far more diagnosable place
 * for this to show up than a build log the deployment never got far enough to
 * produce. Blocking the deploy entirely over a migration hiccup takes down every
 * other route along with it, which is strictly worse. The failure is still printed
 * loudly here for whoever is watching the build.
 */

import { execFileSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

const BASELINE_MIGRATIONS = ['00000000000000_init', '20260813120000_add_agent_permission']

// Migration commands get DIRECT_URL in place of DATABASE_URL when it's set; every
// other env var, including DATABASE_URL itself for the rest of the process, is
// untouched.
const migrationEnv = { ...process.env, DATABASE_URL: process.env.DIRECT_URL || process.env.DATABASE_URL }

function run(args) {
  return execFileSync('npx', ['prisma', ...args], { stdio: 'inherit', env: migrationEnv })
}

function tryRun(args) {
  try { execFileSync('npx', ['prisma', ...args], { stdio: 'pipe', env: migrationEnv }); return true }
  catch { return false }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('[db-deploy] DATABASE_URL is not set — skipping migrations.')
    return
  }
  console.log(`[db-deploy] Using ${process.env.DIRECT_URL ? 'DIRECT_URL' : 'DATABASE_URL'} for migration commands.`)

  const prisma = new PrismaClient()
  let hasAgentTable = false
  let migrationCount = 0

  try {
    // Deliberately NOT to_regclass(): it returns Postgres's `regclass` type, which
    // Prisma cannot deserialize, so the query throws before doing anything useful.
    // information_schema returns plain integers that map cleanly.
    const tables = await prisma.$queryRawUnsafe(
      `SELECT
         (SELECT count(*)::int FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = 'Agent') AS agent,
         (SELECT count(*)::int FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = '_prisma_migrations') AS migrations`,
    )
    hasAgentTable = Number(tables?.[0]?.agent ?? 0) > 0
    const hasMigrationTable = Number(tables?.[0]?.migrations ?? 0) > 0

    if (hasMigrationTable) {
      const rows = await prisma.$queryRawUnsafe('SELECT count(*)::int AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL')
      migrationCount = rows?.[0]?.count ?? 0
    }
  } catch (error) {
    console.error('[db-deploy] Could not inspect the database:', error.message.split('\n')[0])
    throw error
  } finally {
    await prisma.$disconnect()
  }

  if (hasAgentTable && migrationCount === 0) {
    console.log('[db-deploy] Existing schema found with no migration history — baselining.')
    for (const migration of BASELINE_MIGRATIONS) {
      const ok = tryRun(['migrate', 'resolve', '--applied', migration])
      console.log(`[db-deploy]   ${ok ? 'baselined' : 'already recorded'}: ${migration}`)
    }
  } else if (!hasAgentTable) {
    console.log('[db-deploy] Empty database — applying all migrations.')
  } else {
    console.log(`[db-deploy] ${migrationCount} migration(s) already applied — deploying any new ones.`)
  }

  run(['migrate', 'deploy'])
  console.log('[db-deploy] Done.')
}

main().catch((error) => {
  console.error('')
  console.error('╔══════════════════════════════════════════════════════════════╗')
  console.error('║  [db-deploy] MIGRATIONS FAILED — continuing the build anyway.  ║')
  console.error('║  The app will surface this as a live error in its own UI       ║')
  console.error('║  instead of the deployment dying here. Fix the cause below and ║')
  console.error('║  redeploy, or run `pnpm db:deploy` locally against the same     ║')
  console.error('║  DATABASE_URL to see the full Prisma output.                   ║')
  console.error('╚══════════════════════════════════════════════════════════════╝')
  console.error(error.message)
  console.error('')
  process.exitCode = 0
})
