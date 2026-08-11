import { PrismaClient } from '@prisma/client'
import { agents } from '../lib/kymera'

const prisma = new PrismaClient()

const additional = [
  { id: 'sentinel', name: 'Sentinel Risk', symbol: 'SR', description: 'Surfaces operational and market risks before they become expensive.', category: 'Research', score: 74, verified: true, runs: '1.8k', success: '92.4%', change: '+1.9%', status: 'Live', accent: '#2a9d8f', tags: ['Risk', 'Alerts', 'Monitoring'], creator: 'Sentinel Labs', updated: '6h ago' },
  { id: 'orbit', name: 'Orbit Router', symbol: 'OR', description: 'Routes multi-step workflows across teams with clear ownership and timing.', category: 'Operations', score: 72, verified: false, runs: '1.4k', success: '94.8%', change: '+2.4%', status: 'Beta', accent: '#577590', tags: ['Routing', 'Teams', 'SLA'], creator: 'Orbit Systems', updated: '8h ago' },
  { id: 'prism', name: 'Prism Signals', symbol: 'PS', description: 'Condenses fast-moving signals into concise watchlists and briefs.', category: 'Trading', score: 69, verified: true, runs: '980', success: '88.9%', change: '+0.7%', status: 'Live', accent: '#f4a261', tags: ['Signals', 'Watchlists', 'Data'], creator: 'Prism Works', updated: 'Yesterday' },
  { id: 'canvas', name: 'Canvas Briefs', symbol: 'CB', description: 'Turns scattered notes into polished, structured creative briefs.', category: 'Creative', score: 66, verified: false, runs: '760', success: '89.5%', change: '+3.1%', status: 'Beta', accent: '#e76f51', tags: ['Briefs', 'Copy', 'Creative'], creator: 'Canvas House', updated: '2d ago' },
]

const seedAgents = [...agents, ...additional]

async function main() {
  for (const agent of seedAgents) {
    await prisma.agent.upsert({
      where: { id: agent.id },
      update: { name: agent.name, description: agent.description, category: agent.category, verified: agent.verified, status: agent.status },
      create: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        category: agent.category,
        chain: 'BNB Smart Chain',
        endpoint: `https://api.kymera.demo/agents/${agent.id}`,
        ownerAddress: `0x${agent.id.padEnd(40, '0').slice(0, 40)}`,
        registrationId: `kymera-demo-${agent.id}`,
        capabilities: agent.tags,
        supportedProtocols: ['ERC-8004', 'JSON-RPC'],
        price: 0.01,
        verified: agent.verified,
        status: agent.status,
        performance: { create: { successRate: Number(agent.success.replace('%', '')), tasksCompleted: Number(agent.runs.replace('k', '')) * (agent.runs.includes('k') ? 1000 : 1), failedTasks: 0, avgExecutionTime: 1.2, totalVolume: 0, kymeraScore: agent.score, lastEvaluatedAt: new Date() } },
        capabilityItems: { create: agent.tags.map((name) => ({ name, description: `${name} capability for ${agent.name}` })) },
      },
    })
  }
}

main().finally(() => prisma.$disconnect())
