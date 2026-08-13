CREATE TABLE "AgentPermission" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "AgentPermission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentPermission_sessionId_idx" ON "AgentPermission"("sessionId");

ALTER TABLE "AgentPermission"
ADD CONSTRAINT "AgentPermission_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "AgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
