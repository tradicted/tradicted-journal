import type { Trade } from './types'

export const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
})

export const usd2 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export function formatPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

export function formatR(v: number | null): string {
  if (v === null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}R`
}

export function formatPnl(v: number | null, symbol = '$'): string {
  if (v === null) return '—'
  const abs = Math.abs(v).toFixed(2)
  return `${v >= 0 ? '+' : '-'}${symbol}${abs}`
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

export function calcPnlFromTrade(trade: Partial<Trade>): number | null {
  if (!trade.entry_price || !trade.exit_price || !trade.position_size || !trade.direction) return null
  return trade.direction === 'long'
    ? (trade.exit_price - trade.entry_price) * trade.position_size
    : (trade.entry_price - trade.exit_price) * trade.position_size
}

export function calcRMultipleFromTrade(trade: Partial<Trade>): number | null {
  const pnl = calcPnlFromTrade(trade)
  if (pnl === null || !trade.stop_loss || !trade.entry_price || !trade.position_size) return null
  const riskPerUnit = Math.abs(trade.entry_price - trade.stop_loss)
  if (riskPerUnit <= 0) return null
  return pnl / (riskPerUnit * trade.position_size)
}

export function today(): string {
  return new Date().toISOString().split('T')[0]
}

export function parseTags(tagsJson: string | null): string[] {
  if (!tagsJson) return []
  try {
    return JSON.parse(tagsJson)
  } catch {
    return []
  }
}

export function stringifyTags(tags: string[]): string {
  return JSON.stringify(tags.filter(Boolean))
}

export function directionColor(d: string): string {
  return d === 'long' ? 'text-heatmap-profit-heavy' : 'text-heatmap-loss-heavy'
}

export function pnlColor(v: number | null): string {
  if (v === null) return 'text-slate-400'
  return v >= 0 ? 'text-heatmap-profit-heavy' : 'text-heatmap-loss-heavy'
}
