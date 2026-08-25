-- AlterTable
ALTER TABLE "AgentHire" ADD COLUMN     "paymentAmountWei" TEXT,
ADD COLUMN     "paymentChainId" INTEGER,
ADD COLUMN     "paymentRecipient" TEXT,
ADD COLUMN     "paymentTxHash" TEXT;

-- AlterTable
ALTER TABLE "GuardExecution" ADD COLUMN     "hireId" TEXT,
ALTER COLUMN "sessionId" DROP NOT NULL;

