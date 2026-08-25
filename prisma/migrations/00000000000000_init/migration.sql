-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "endpoint" TEXT,
    "ownerAddress" TEXT NOT NULL,
    "registrationId" TEXT,
    "capabilities" JSONB NOT NULL,
    "supportedProtocols" JSONB NOT NULL,
    "price" DECIMAL(18,8),
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'Live',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "erc8004ChainId" INTEGER,
    "erc8004RegistryAddress" TEXT,
    "erc8004TokenId" TEXT,
    "erc8004MetadataUri" TEXT,
    "erc8004MetadataHash" TEXT,
    "erc8004LastSyncedAt" TIMESTAMP(3),
    "erc8004RawRegistration" JSONB,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentHire" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "userAddress" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
    "paymentProvider" TEXT NOT NULL,
    "paymentId" TEXT,
    "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    "amount" DECIMAL(18,8) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "task" TEXT NOT NULL,
    "benchmarkId" TEXT,
    "sessionId" TEXT,
    "requestedPermissions" JSONB NOT NULL,
    "blockedActions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),

    CONSTRAINT "AgentHire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentPerformance" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "successRate" DOUBLE PRECISION NOT NULL,
    "tasksCompleted" INTEGER NOT NULL DEFAULT 0,
    "failedTasks" INTEGER NOT NULL DEFAULT 0,
    "avgExecutionTime" DOUBLE PRECISION NOT NULL,
    "totalVolume" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "kymeraScore" DOUBLE PRECISION NOT NULL,
    "lastEvaluatedAt" TIMESTAMP(3),

    CONSTRAINT "AgentPerformance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTask" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "result" JSONB,
    "executionTime" DOUBLE PRECISION,
    "cost" DECIMAL(18,8),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentCapability" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "AgentCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTransaction" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "amount" DECIMAL(18,8),
    "status" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSession" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "userAddress" TEXT NOT NULL,
    "spendingLimit" DECIMAL(18,8),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "mode" TEXT NOT NULL DEFAULT 'SIMULATION',
    "provider" TEXT NOT NULL DEFAULT 'KYмERA_GUARD',
    "walletAddress" TEXT,
    "providerSessionId" TEXT,
    "network" TEXT,
    "verificationUrl" TEXT,
    "grantTxHash" TEXT,

    CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AltanaWallet" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AltanaWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AltanaSession" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "allowedContracts" JSONB NOT NULL,
    "allowedMethods" JSONB NOT NULL,
    "spendingCap" DECIMAL(18,8),
    "expiry" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "simulated" BOOLEAN NOT NULL DEFAULT true,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AltanaSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AltanaExecution" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "value" DECIMAL(18,8),
    "status" TEXT NOT NULL,
    "simulated" BOOLEAN NOT NULL DEFAULT true,
    "txHash" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AltanaExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentJob" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "network" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "evaluator" TEXT NOT NULL,
    "budget" DECIMAL(18,8) NOT NULL,
    "status" TEXT NOT NULL,
    "simulated" BOOLEAN NOT NULL DEFAULT true,
    "txHash" TEXT,
    "from" TEXT,
    "to" TEXT,
    "value" DECIMAL(18,8),
    "submittedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "blockNumber" BIGINT,
    "gasUsed" BIGINT,
    "effectiveGasPrice" BIGINT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentAuditLog" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorAddress" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Benchmark" (
    "id" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Benchmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenchmarkResult" (
    "id" TEXT NOT NULL,
    "benchmarkId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "executionTime" DOUBLE PRECISION,
    "cost" DECIMAL(18,8),
    "riskScore" DOUBLE PRECISION,
    "score" DOUBLE PRECISION,
    "capabilityMatch" DOUBLE PRECISION,
    "taskRelevance" DOUBLE PRECISION,
    "protocolMatch" DOUBLE PRECISION,
    "metadataQuality" DOUBLE PRECISION,
    "evaluationConfidence" DOUBLE PRECISION,
    "reasoning" JSONB,
    "result" JSONB,
    "rank" INTEGER,

    CONSTRAINT "BenchmarkResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Agent_category_idx" ON "Agent"("category");

-- CreateIndex
CREATE INDEX "Agent_chain_idx" ON "Agent"("chain");

-- CreateIndex
CREATE INDEX "Agent_status_idx" ON "Agent"("status");

-- CreateIndex
CREATE INDEX "Agent_verified_idx" ON "Agent"("verified");

-- CreateIndex
CREATE INDEX "Agent_ownerAddress_idx" ON "Agent"("ownerAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_erc8004ChainId_erc8004RegistryAddress_erc8004TokenId_key" ON "Agent"("erc8004ChainId", "erc8004RegistryAddress", "erc8004TokenId");

-- CreateIndex
CREATE INDEX "AgentHire_userAddress_status_idx" ON "AgentHire"("userAddress", "status");

-- CreateIndex
CREATE INDEX "AgentHire_agentId_createdAt_idx" ON "AgentHire"("agentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentPerformance_agentId_key" ON "AgentPerformance"("agentId");

-- CreateIndex
CREATE INDEX "AgentPerformance_kymeraScore_idx" ON "AgentPerformance"("kymeraScore");

-- CreateIndex
CREATE INDEX "AgentTask_agentId_status_idx" ON "AgentTask"("agentId", "status");

-- CreateIndex
CREATE INDEX "AgentCapability_agentId_idx" ON "AgentCapability"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentTransaction_txHash_key" ON "AgentTransaction"("txHash");

-- CreateIndex
CREATE INDEX "AgentTransaction_agentId_timestamp_idx" ON "AgentTransaction"("agentId", "timestamp");

-- CreateIndex
CREATE INDEX "AgentSession_agentId_status_idx" ON "AgentSession"("agentId", "status");

-- CreateIndex
CREATE INDEX "AgentSession_userAddress_idx" ON "AgentSession"("userAddress");

-- CreateIndex
CREATE UNIQUE INDEX "AltanaWallet_address_key" ON "AltanaWallet"("address");

-- CreateIndex
CREATE INDEX "AltanaSession_agentId_status_idx" ON "AltanaSession"("agentId", "status");

-- CreateIndex
CREATE INDEX "AltanaExecution_agentId_createdAt_idx" ON "AltanaExecution"("agentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentJob_txHash_key" ON "AgentJob"("txHash");

-- CreateIndex
CREATE INDEX "AgentJob_network_status_idx" ON "AgentJob"("network", "status");

-- CreateIndex
CREATE INDEX "AgentAuditLog_sessionId_createdAt_idx" ON "AgentAuditLog"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "Benchmark_status_idx" ON "Benchmark"("status");

-- CreateIndex
CREATE INDEX "BenchmarkResult_agentId_idx" ON "BenchmarkResult"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "BenchmarkResult_benchmarkId_agentId_key" ON "BenchmarkResult"("benchmarkId", "agentId");

-- AddForeignKey
ALTER TABLE "AgentHire" ADD CONSTRAINT "AgentHire_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPerformance" ADD CONSTRAINT "AgentPerformance_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentCapability" ADD CONSTRAINT "AgentCapability_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTransaction" ADD CONSTRAINT "AgentTransaction_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltanaSession" ADD CONSTRAINT "AltanaSession_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "AltanaWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltanaExecution" ADD CONSTRAINT "AltanaExecution_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "AltanaWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltanaExecution" ADD CONSTRAINT "AltanaExecution_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AltanaSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAuditLog" ADD CONSTRAINT "AgentAuditLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenchmarkResult" ADD CONSTRAINT "BenchmarkResult_benchmarkId_fkey" FOREIGN KEY ("benchmarkId") REFERENCES "Benchmark"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenchmarkResult" ADD CONSTRAINT "BenchmarkResult_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

