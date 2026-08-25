/**
 * Local development seed.
 *
 * These are catalog entries for local development only. They carry NO fabricated
 * performance data — no invented success rates, run counts, or scores. They are
 * inserted as unevaluated, and the real evaluation pipeline scores them from the
 * same evidence it uses for registry-sourced agents. A locally-seeded agent with no
 * on-chain identity legitimately scores lower than an ERC-8004 registered one; that
 * difference is the point.
 *
 * Run with: pnpm db:seed
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/** Clearly a placeholder, and never presented as a real owner in the UI. */
const DEMO_OWNER = '0x000000000000000000000000000000000000dEaD'

const catalog = [
  {
    id: 'demo-atlas',
    name: 'Atlas Research',
    description: 'Turns noisy BNB Chain market data into decision-ready research briefs with cited sources.',
    category: 'Research',
    capabilities: ['market intel', 'reports', 'sources', 'analytics'],
    supportedProtocols: ['A2A', 'MCP'],
  },
  {
    id: 'demo-cobalt',
    name: 'Cobalt Yield',
    description: 'Monitors PancakeSwap yield opportunities and flags liquidity and risk conditions before capital moves.',
    category: 'Trading',
    capabilities: ['yield', 'risk', 'alerts', 'pancakeswap', 'liquidity'],
    supportedProtocols: ['A2A', 'REST'],
  },
  {
    id: 'demo-meridian',
    name: 'Meridian Ops',
    description: 'Keeps recurring on-chain operations moving with dependable task routing and monitoring.',
    category: 'Operations',
    capabilities: ['routing', 'automation', 'monitoring', 'sla'],
    supportedProtocols: ['MCP'],
  },
  {
    id: 'demo-sentinel',
    name: 'Sentinel Risk',
    description: 'Reviews Guard permissions and surfaces operational risk before an agent is granted execution rights.',
    category: 'Security',
    capabilities: ['security', 'guard', 'permissions', 'audit', 'risk'],
    supportedProtocols: ['A2A', 'MCP', 'REST'],
  },
  {
    id: 'demo-quanta',
    name: 'Quanta Scout',
    description: 'Finds early signals across on-chain activity and public research for BNB Chain markets.',
    category: 'Analytics',
    capabilities: ['signals', 'discovery', 'data', 'monitoring'],
    supportedProtocols: ['REST'],
  },
]

async function main() {
  for (const agent of catalog) {
    await prisma.agent.upsert({
      where: { id: agent.id },
      update: {
        name: agent.name,
        description: agent.description,
        category: agent.category,
        capabilities: agent.capabilities,
        supportedProtocols: agent.supportedProtocols,
      },
      create: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        category: agent.category,
        chain: 'BNB Chain',
        ownerAddress: DEMO_OWNER,
        capabilities: agent.capabilities,
        supportedProtocols: agent.supportedProtocols,
        price: 0,
        // No ERC-8004 identity, so `verified` stays false and the trust tier stays
        // INDEXED until the evaluation pipeline says otherwise.
        verified: false,
        trustTier: 'INDEXED',
        evaluationStatus: 'UNEVALUATED',
        status: 'Live',
        capabilityItems: { create: agent.capabilities.map((name) => ({ name })) },
      },
    })
  }

  const count = await prisma.agent.count()
  console.log(`Seeded ${catalog.length} local catalog agents (${count} total).`)
  console.log('These are unevaluated. Run an evaluation to score them from real evidence:')
  console.log('  curl -X POST localhost:3000/api/agents/evaluate -H "authorization: Bearer $KYMERA_ADMIN_TOKEN" -d \'{"probe":false}\'')
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
