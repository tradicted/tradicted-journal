import { ElectronAPI } from '@electron-toolkit/preload'

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
  trade_uid: string | null
}

export interface JournalEntry {
  id: number
  date: string
  content: string | null
  mood: string | null
  trade_id: number | null
  created_at: string
}

export interface Portfolio {
  id: string
  name: string
  sort_order: number
  created_at: string
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

interface AppAPI {
  trades: {
    create: (trade: Omit<Trade, 'id' | 'created_at' | 'updated_at' | 'trade_uid' | 'closed_at'> & { trade_uid?: string | null; closed_at?: string | null }) => Promise<Trade>
    update: (id: number, data: Partial<Trade>) => Promise<Trade>
    delete: (id: number) => Promise<{ success: boolean }>
    getAll: (portfolioId?: string) => Promise<Trade[]>
    getById: (id: number) => Promise<Trade | null>
    getByDateRange: (start: string, end: string) => Promise<Trade[]>
  }
  journal: {
    create: (entry: Omit<JournalEntry, 'id' | 'created_at'>) => Promise<JournalEntry>
    getAll: () => Promise<JournalEntry[]>
  }
  analytics: {
    getSummary: (portfolioId?: string) => Promise<AnalyticsSummary>
  }
  data: {
    exportCSV: () => Promise<{ success: boolean; filePath?: string }>
    exportJSON: () => Promise<{ success: boolean; filePath?: string }>
    importCSV: (importSettings?: boolean) => Promise<{
      success: boolean
      cancelled?: boolean
      imported?: number
      skipped?: number
      errors?: string[]
      error?: string
    }>
  }
  portfolios: {
    getAll: () => Promise<Portfolio[]>
    add: (id: string, name: string) => Promise<Portfolio>
    rename: (id: string, name: string) => Promise<{ success: boolean }>
    delete: (id: string) => Promise<{ success: boolean; error?: string }>
  }
  settings: {
    get: (key: string) => Promise<string | null>
    set: (key: string, value: string) => Promise<{ success: boolean }>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: AppAPI
  }
}
