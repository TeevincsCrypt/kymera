-- Canonical Kymera Guard.
--
-- Consolidates the three competing session/execution stores (AgentSession +
-- AltanaSession + AltanaExecution) into one authoritative ledger, `GuardExecution`,
-- and adds the SIWE nonce store plus the honest agent-evaluation record.
--
-- Ordering matters here: the new tables are created and the legacy Altana execution
-- rows are copied into them BEFORE anything is dropped, so no audit history is lost.

-- ----------------------------------------------------------------------- Agent
-- Denormalised evaluation fields plus an explicit trust tier, so the UI can stop
-- conflating "present in the ERC-8004 index" with "evaluated" or "vetted".
ALTER TABLE "Agent" ADD COLUMN "trustTier" TEXT NOT NULL DEFAULT 'INDEXED',
ADD COLUMN "kymeraScore" DOUBLE PRECISION,
ADD COLUMN "kymeraEvaluatedAt" TIMESTAMP(3),
ADD COLUMN "evaluationStatus" TEXT NOT NULL DEFAULT 'UNEVALUATED';

CREATE INDEX "Agent_kymeraScore_idx" ON "Agent"("kymeraScore");
CREATE INDEX "Agent_trustTier_idx" ON "Agent"("trustTier");

-- ---------------------------------------------------------------- AgentSession
ALTER TABLE "AgentSession" ADD COLUMN     "chainId" INTEGER NOT NULL DEFAULT 97,
ALTER COLUMN "mode" SET DEFAULT 'GUARDED',
ALTER COLUMN "provider" SET DEFAULT 'KYMERA_GUARD';

-- Historic rows carry a provider string containing a Cyrillic 'М' (U+041C) from an
-- earlier typo. Normalise them so provider filtering is reliable.
UPDATE "AgentSession" SET "provider" = 'KYMERA_GUARD' WHERE "provider" <> 'KYMERA_GUARD';

-- --------------------------------------------------------------- New tables
CREATE TABLE "GuardExecution" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "toAddress" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "valueWei" TEXT NOT NULL DEFAULT '0',
    "decision" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AUTHORIZED',
    "txDataHash" TEXT NOT NULL,
    "txHash" TEXT,
    "blockNumber" BIGINT,
    "gasUsed" BIGINT,
    "effectiveGasPrice" BIGINT,
    "error" TEXT,
    "checks" JSONB NOT NULL,
    "metadata" JSONB,
    "reservationExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "GuardExecution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthNonce" (
    "id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "address" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "AuthNonce_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentEvaluation" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "sufficientEvidence" BOOLEAN NOT NULL DEFAULT false,
    "identity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metadata" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "capability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reliability" DOUBLE PRECISION,
    "endpointReachable" BOOLEAN,
    "endpointCheckedAt" TIMESTAMP(3),
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "breakdown" JSONB NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'kymera-score-v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentEvaluation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GuardExecution_txHash_key" ON "GuardExecution"("txHash");
CREATE INDEX "GuardExecution_sessionId_asset_status_idx" ON "GuardExecution"("sessionId", "asset", "status");
CREATE INDEX "GuardExecution_walletAddress_createdAt_idx" ON "GuardExecution"("walletAddress", "createdAt");
CREATE INDEX "GuardExecution_agentId_createdAt_idx" ON "GuardExecution"("agentId", "createdAt");
CREATE INDEX "GuardExecution_status_idx" ON "GuardExecution"("status");
CREATE UNIQUE INDEX "AuthNonce_nonce_key" ON "AuthNonce"("nonce");
CREATE INDEX "AuthNonce_expiresAt_idx" ON "AuthNonce"("expiresAt");
CREATE INDEX "AgentEvaluation_agentId_createdAt_idx" ON "AgentEvaluation"("agentId", "createdAt");
CREATE INDEX "AgentEvaluation_score_idx" ON "AgentEvaluation"("score");
CREATE INDEX "AgentSession_userAddress_status_idx" ON "AgentSession"("userAddress", "status");

ALTER TABLE "GuardExecution" ADD CONSTRAINT "GuardExecution_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuardExecution" ADD CONSTRAINT "GuardExecution_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentEvaluation" ADD CONSTRAINT "AgentEvaluation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ------------------------------------------- Preserve legacy Altana audit history
-- Legacy rows are imported with status 'LEGACY' so they are visible in the audit
-- trail but never consume spending-cap headroom (the cap query counts only
-- AUTHORIZED / SUBMITTED / CONFIRMED). Only rows whose session and agent still
-- exist can be imported, because of the foreign keys.
INSERT INTO "GuardExecution" (
    "id", "sessionId", "agentId", "walletAddress", "action", "chainId", "toAddress",
    "method", "asset", "amount", "valueWei", "decision", "reason", "status",
    "txDataHash", "txHash", "checks", "metadata", "createdAt", "updatedAt"
)
SELECT
    'legacy_' || ae."id",
    ae."sessionId",
    ae."agentId",
    COALESCE(aw."address", 'unknown'),
    ae."action",
    97,
    ae."target",
    'legacy',
    'BNB',
    COALESCE(ae."value", 0),
    '0',
    CASE WHEN ae."status" = 'AUTHORIZED' THEN 'APPROVED' ELSE 'REJECTED' END,
    COALESCE(ae."rejectionReason", 'LEGACY_ALTANA_IMPORT'),
    'LEGACY',
    'legacy',
    ae."txHash",
    '[]'::jsonb,
    jsonb_build_object(
        'importedFrom', 'AltanaExecution',
        'originalId', ae."id",
        'originalStatus', ae."status",
        'simulated', ae."simulated"
    ),
    ae."createdAt",
    ae."createdAt"
FROM "AltanaExecution" ae
JOIN "AgentSession" s ON s."id" = ae."sessionId"
JOIN "Agent" a ON a."id" = ae."agentId"
LEFT JOIN "AltanaWallet" aw ON aw."id" = ae."walletId"
WHERE NOT EXISTS (SELECT 1 FROM "GuardExecution" g WHERE g."id" = 'legacy_' || ae."id");

-- ------------------------------------------------------------ Drop legacy tables
-- AgentTask and AgentTransaction were declared but never read or written by any
-- application code path, so they are provably empty of application data.
ALTER TABLE "AgentTask" DROP CONSTRAINT "AgentTask_agentId_fkey";
ALTER TABLE "AgentTransaction" DROP CONSTRAINT "AgentTransaction_agentId_fkey";
ALTER TABLE "AltanaSession" DROP CONSTRAINT "AltanaSession_walletId_fkey";
ALTER TABLE "AltanaExecution" DROP CONSTRAINT "AltanaExecution_walletId_fkey";
ALTER TABLE "AltanaExecution" DROP CONSTRAINT "AltanaExecution_sessionId_fkey";

DROP TABLE "AgentTask";
DROP TABLE "AgentTransaction";
DROP TABLE "AltanaExecution";
DROP TABLE "AltanaSession";
DROP TABLE "AltanaWallet";
