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
 */

import { execFileSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

const BASELINE_MIGRATIONS = ['00000000000000_init', '20260813120000_add_agent_permission']

function run(args) {
  return execFileSync('npx', ['prisma', ...args], { stdio: 'inherit', env: process.env })
}

function tryRun(args) {
  try { execFileSync('npx', ['prisma', ...args], { stdio: 'pipe', env: process.env }); return true }
  catch { return false }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('[db-deploy] DATABASE_URL is not set — skipping migrations.')
    return
  }

  const prisma = new PrismaClient()
  let hasAgentTable = false
  let migrationCount = 0

  try {
    const tables = await prisma.$queryRawUnsafe(
      `SELECT to_regclass('public."Agent"') AS agent, to_regclass('public._prisma_migrations') AS migrations`,
    )
    hasAgentTable = Boolean(tables?.[0]?.agent)
    const hasMigrationTable = Boolean(tables?.[0]?.migrations)

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
  console.error('[db-deploy] FAILED:', error.message)
  process.exit(1)
})
