export type AgentCategory = 'Trading' | 'Research' | 'Operations' | 'Creative'

export type Agent = {
  id: string
  name: string
  symbol: string
  description: string
  category: AgentCategory
  score: number
  verified: boolean
  runs: string
  success: string
  change: string
  status: 'Live' | 'Beta' | 'Paused'
  accent: string
  tags: string[]
  creator: string
  updated: string
}

export const agents: Agent[] = [
  { id: 'atlas', name: 'Atlas Research', symbol: 'AT', description: 'Turns noisy market data into clear, decision-ready research briefs.', category: 'Research', score: 94, verified: true, runs: '18.4k', success: '96.8%', change: '+4.2%', status: 'Live', accent: '#ff6b2c', tags: ['Market intel', 'Reports', 'Sources'], creator: 'Northstar Labs', updated: '2h ago' },
  { id: 'cobalt', name: 'Cobalt Yield', symbol: 'CY', description: 'Monitors yield opportunities and flags risk before capital moves.', category: 'Trading', score: 91, verified: true, runs: '12.7k', success: '94.1%', change: '+2.8%', status: 'Live', accent: '#4361ee', tags: ['Yield', 'Risk', 'Alerts'], creator: 'Cobalt Collective', updated: '18m ago' },
  { id: 'meridian', name: 'Meridian Ops', symbol: 'MO', description: 'Keeps recurring operations moving with dependable task routing.', category: 'Operations', score: 88, verified: true, runs: '9.2k', success: '98.4%', change: '+1.6%', status: 'Live', accent: '#16a085', tags: ['Routing', 'SLA', 'Automation'], creator: 'Meridian Systems', updated: '1h ago' },
  { id: 'loom', name: 'Loom Studio', symbol: 'LS', description: 'Transforms rough ideas into campaign-ready creative direction.', category: 'Creative', score: 86, verified: false, runs: '6.8k', success: '91.7%', change: '+6.9%', status: 'Beta', accent: '#9b5de5', tags: ['Copy', 'Concepts', 'Brand'], creator: 'Loom House', updated: '5h ago' },
  { id: 'quanta', name: 'Quanta Scout', symbol: 'QS', description: 'Finds early signals across onchain activity and public research.', category: 'Research', score: 83, verified: true, runs: '5.1k', success: '93.2%', change: '+3.4%', status: 'Live', accent: '#f4a261', tags: ['Signals', 'Discovery', 'Data'], creator: 'Quanta Works', updated: '3h ago' },
  { id: 'relay', name: 'Relay Desk', symbol: 'RD', description: 'A calm, fast operator for support triage and customer follow-up.', category: 'Operations', score: 81, verified: false, runs: '4.7k', success: '95.6%', change: '+2.1%', status: 'Beta', accent: '#e76f51', tags: ['Support', 'Triage', 'CRM'], creator: 'Relay Studio', updated: 'Yesterday' },
  { id: 'vector', name: 'Vector Alpha', symbol: 'VA', description: 'Backtests systematic strategies against transparent benchmark sets.', category: 'Trading', score: 79, verified: true, runs: '3.9k', success: '89.6%', change: '-0.8%', status: 'Live', accent: '#118ab2', tags: ['Backtest', 'Strategies', 'Models'], creator: 'Vector Labs', updated: '4h ago' },
  { id: 'mosaic', name: 'Mosaic Copy', symbol: 'MC', description: 'Builds sharp, on-brand copy systems for small creative teams.', category: 'Creative', score: 76, verified: false, runs: '2.4k', success: '90.3%', change: '+5.5%', status: 'Paused', accent: '#8338ec', tags: ['Copy', 'Voice', 'Editorial'], creator: 'Mosaic Co.', updated: '3d ago' },
]

export const activity = [
  ['Atlas Research', 'completed a benchmark run', '2 min ago'],
  ['Cobalt Yield', 'was added to your workspace', '18 min ago'],
  ['Meridian Ops', 'received a new permission', '1 hr ago'],
  ['Loom Studio', 'published a new version', '5 hrs ago'],
]

export const getAgent = (id: string) => agents.find((agent) => agent.id === id) ?? agents[0]
export const categories = ['All', 'Trading', 'Research', 'Operations', 'Creative'] as const

export function formatDateLabel() { return 'Demo data · refreshed today' }
