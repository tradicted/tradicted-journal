export interface TagDefinition {
  id: string
  label: string
  color: string
  negative?: boolean
}

export interface GradeDefinition {
  id: string
  label: string
  color: string
}

export interface Portfolio {
  id: string
  name: string
  sort_order: number
  created_at: string
}

export interface Trade {
  id: number
  date: string
  symbol: string
  direction: 'long' | 'short'
  entry_price: number
  exit_price: number | null
  stop_loss: number | null
  take_profit: number | null
  position_size: number
  pnl: number | null
  r_multiple: number | null
  status: 'open' | 'closed' | 'cancelled'
  notes: string | null
  tags: string | null
  screenshot_path: string | null
  portfolio_id: string
  setup_tag: string | null
  psych_tag: string | null
  grade: string | null
  rules_followed: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
}

export interface JournalEntry {
  id: number
  date: string
  content: string | null
  mood: string | null
  trade_id: number | null
  created_at: string
}

export interface GroupStats {
  count: number
  wins: number
  losses: number
  open: number
  pnl: number
  winRate: number | null
  avgRR: number | null
}

export interface AnalyticsSummary {
  totalTrades: number
  closedTrades: number
  openTrades: number
  wonCount: number
  lostCount: number
  winRate: number | null
  avgR: number | null
  avgWinRR: number | null
  avgLossRR: number | null
  totalPnl: number
  profitFactor: number | null
  expectancy: number | null
  avgWinDollar: number | null
  avgLossDollar: number | null
  largestWin: number | null
  largestLoss: number | null
  maxDrawdown: number
  currentStreak: { type: 'win' | 'loss' | null; count: number }
  equityCurve: { index: number; date: string; time: string; pnl: number }[]
  monthlyPnl: { month: string; pnl: number }[]
}

export interface PlanOption {
  id: string
  letter: string
  text: string
  name: string
  checked: boolean
}

export interface PlanRule {
  id: string
  number: number
  text: string
  name: string
  hasOptions: boolean
  checked: boolean
  options: PlanOption[]
}

export type TradeFormData = {
  date: string
  symbol: string
  direction: 'long' | 'short'
  entry_price: string
  exit_price: string
  stop_loss: string
  take_profit: string
  position_size: string
  status: 'open' | 'closed' | 'cancelled'
  notes: string
  tags: string
}
