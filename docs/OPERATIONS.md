# Kymera operations

## Database migrations

The schema is now fully captured in migrations. Three exist, applied in order:

| Migration | Purpose |
|---|---|
| `00000000000000_init` | Baseline: every table except `AgentPermission`. |
| `20260813120000_add_agent_permission` | The original migration, kept so existing history stays valid. |
| `20260814090000_canonical_guard` | Canonical Guard ledger, auth nonces, evaluations, legacy cleanup. |

### A brand-new database

```bash
DATABASE_URL="postgresql://..." pnpm db:deploy
```

This produces the complete schema with no drift. Verified against a clean Postgres 16
instance: `prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel prisma/schema.prisma`
returns an empty migration.

### The existing Neon database (one-time baseline)

The pre-existing database already has the tables from before migrations were tracked, so
the baseline must be marked as applied rather than re-run:

```bash
export DATABASE_URL="postgresql://...your-neon-url..."

# 1. Tell Prisma the baseline is already in place. This runs no SQL.
npx prisma migrate resolve --applied 00000000000000_init

# 2. If the original AgentPermission migration is not already recorded, mark it too.
#    (Check with: SELECT migration_name FROM "_prisma_migrations";)
npx prisma migrate resolve --applied 20260813120000_add_agent_permission

# 3. Apply the new work.
npx prisma migrate deploy
```

**What step 3 does to your data:**

- Adds columns to `Agent` (`trustTier`, `kymeraScore`, `kymeraEvaluatedAt`, `evaluationStatus`)
  and `AgentSession` (`chainId`). Existing rows keep their data and take defaults.
- Normalises the `AgentSession.provider` typo (a Cyrillic `М` had crept into the string).
- Creates `GuardExecution`, `AuthNonce`, `AgentEvaluation`.
- **Copies** every `AltanaExecution` row into `GuardExecution` with status `LEGACY`
  before dropping the Altana tables, so no audit history is lost. Legacy rows are
  visible in the audit trail but never consume spending-cap headroom.
- Drops `AgentTask` and `AgentTransaction`. These were declared in the schema but never
  read or written by any application code path, so they hold no application data.

This was rehearsed end to end against a Postgres instance seeded with representative
rows; agents, sessions, permissions, and Altana execution history all survived.

## Evaluation

Agents imported by an ERC-8004 sync are evaluated automatically (without endpoint
probing). To evaluate the catalog in bulk, including live endpoint reachability:

```bash
curl -X POST https://<host>/api/agents/evaluate \
  -H "authorization: Bearer $KYMERA_ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"limit":50,"probe":true,"onlyUnevaluated":true}'
```

The route is disabled unless `KYMERA_ADMIN_TOKEN` is set. Endpoint probing makes
server-side requests to agent-controlled URLs, so it is restricted to HTTPS,
publicly-routable addresses, with redirects disabled and a 5s timeout.

## Tests

```bash
# Guard, auth, scoring, and policy tests. Needs a throwaway Postgres.
createdb kymera_test
DATABASE_URL="postgresql://.../kymera_test" pnpm db:deploy
DATABASE_URL="postgresql://.../kymera_test" pnpm test
```

The DB-backed tests share one database and run serially (`--test-concurrency=1`).
`resetDatabase()` truncates between tests, so point this at a scratch database only.

## Network safety

Execution is testnet-only unless `KYMERA_ENABLE_MAINNET=true`. With it unset, Guard
returns `CHAIN_NOT_ALLOWED` for any chain 56 request, and there is a test asserting this.
Enable it only deliberately — it permits authorization of real-value mainnet transactions.
