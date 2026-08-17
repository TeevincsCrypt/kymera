import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPancakeProvider } from '@/lib/pancakeswap/provider'

function tokens(value: string) { return value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2) }
function overlap(task: string, value: string) { const wanted = new Set(tokens(task)); return tokens(value).filter((token) => wanted.has(token)).length }

export async function POST(request: Request) {
  try {
    const body = await request.json() as { agentId?: string; task?: string; protocol?: string; risk?: string; sessionId?: string }
    if (!body.agentId || !body.task?.trim()) return NextResponse.json({ error: 'Select an agent and describe a task.' }, { status: 400 })
    const agent = await prisma.agent.findUnique({ where: { id: body.agentId }, include: { capabilityItems: true, performance: true } })
    if (!agent) return NextResponse.json({ error: 'Agent was not found in Neon.' }, { status: 404 })
    const benchmarkCount = await prisma.benchmarkResult.count({ where: { agentId: agent.id } })
    const session = body.sessionId ? await prisma.agentSession.findUnique({ where: { id: body.sessionId }, include: { permissions: true } }) : null
    const provider = getPancakeProvider()
    const health = await provider.health()
    const market = health.status === 'healthy' ? await provider.getPools('', 20) : []
    const profile = [agent.name, agent.description, agent.category, ...(agent.capabilityItems || []).map((item) => item.name), ...(Array.isArray(agent.capabilities) ? agent.capabilities.map(String) : [])].join(' ')
    const taskOverlap = overlap(body.task, profile)
    const capabilityMatch = Math.min(100, 35 + taskOverlap * 15)
    const dataSupport = market.length > 0 ? 100 : 0
    const riskCompliance = body.risk === 'high' ? 70 : session ? 95 : 72
    const confidence = Math.round(capabilityMatch * 0.45 + (benchmarkCount ? 20 : 0) + dataSupport * 0.2 + riskCompliance * 0.15)
    const category = agent.category.toLowerCase()
    const action = category.includes('yield') || profile.toLowerCase().includes('yield') ? 'candidate pool identified' : category.includes('security') ? 'risk factors reviewed' : category.includes('monitor') ? 'market conditions summarized' : 'task scoped for this agent'
    const reasons = [
      `${agent.name} matched ${taskOverlap} task terms across its indexed capabilities`,
      market.length ? `Used ${market.length} live PancakeSwap pool records` : `Live PancakeSwap data was unavailable: ${health.details || 'provider returned no records'}`,
      benchmarkCount ? `Included ${benchmarkCount} persisted benchmark result${benchmarkCount === 1 ? '' : 's'}` : 'No persisted benchmark history was available',
      session ? 'Session permissions were included in the risk assessment' : 'No Guard session was supplied; execution remains disabled',
    ]
    return NextResponse.json({ agent: { id: agent.id, name: agent.name }, task: body.task.trim(), protocol: body.protocol || 'PancakeSwap', output: { action, confidence, risk: confidence >= 75 ? 'Low' : confidence >= 50 ? 'Medium' : 'High', reasoning: reasons, inputs: { livePools: market.length, benchmarkHistory: benchmarkCount, guardSession: Boolean(session), network: 'BNB Chain' } }, execution: 'disabled', source: health })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Simulation failed' }, { status: 500 }) }
}
