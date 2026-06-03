import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { AnalyticsSummary, Trade, GroupStats, PlanRule } from '../types'
import { SummaryCell } from '../components/SummaryCell'
import { usd2 } from '../utils'
import { usePortfolio } from '../context/PortfolioContext'

/* ── helpers ── */

const pct = (v: number) => `${(v * 100).toFixed(1)}%`

/* ── Rule analytics ── */

interface RuleItemStats {
  id: string; label: string; number: number
  letter?: string; parentLabel?: string
  followed: number; total: number; rate: number
  winRateFollowed: number | null; winRateNotFollowed: number | null
  pnlFollowed: number; closedFollowed: number; closedNotFollowed: number
}

interface RuleAdherenceGroup { n: number; trades: number; closed: number; winRate: number | null; pnl: number }

interface RuleAnalytics {
  totalTrades: number; checkableCount: number
  avgFollowed: number | null; avgRate: number | null
  byItem: RuleItemStats[]; byCount: RuleAdherenceGroup[]
}

function calcRuleAnalytics(trades: Trade[], plan: PlanRule[]): RuleAnalytics {
  const empty: RuleAnalytics = { totalTrades: trades.length, checkableCount: 0, avgFollowed: null, avgRate: null, byItem: [], byCount: [] }
  if (trades.length === 0 || plan.length === 0) return empty

  interface CheckableItem { id: string; label: string; number: number; letter?: string; parentLabel?: string }
  const checkable: CheckableItem[] = []
  for (const rule of plan) {
    if (!rule.hasOptions) {
      checkable.push({ id: rule.id, label: rule.name.trim() || rule.text.trim(), number: rule.number })
    } else {
      for (const opt of rule.options) {
        checkable.push({ id: opt.id, label: opt.name.trim() || opt.text.trim(), number: rule.number, letter: opt.letter, parentLabel: rule.name.trim() || rule.text.trim() })
      }
    }
  }
  const checkableCount = checkable.length
  if (checkableCount === 0) return empty

  const checkableIds = new Set(checkable.map((c) => c.id))

  const acc = new Map<string, { followed: number; total: number; winsF: number; lossesF: number; pnlF: number; winsN: number; lossesN: number }>()
  for (const item of checkable) acc.set(item.id, { followed: 0, total: 0, winsF: 0, lossesF: 0, pnlF: 0, winsN: 0, lossesN: 0 })

  const countAcc: Array<{ trades: number; closed: number; wins: number; pnl: number }> =
    Array.from({ length: checkableCount + 1 }, () => ({ trades: 0, closed: 0, wins: 0, pnl: 0 }))

  let totalFollowedSum = 0

  for (const t of trades) {
    const rulesFollowed: string[] = (() => { try { return JSON.parse(t.rules_followed || '[]') } catch { return [] } })()
    const followed = new Set(rulesFollowed.filter((id) => checkableIds.has(id)))
    const followedCount = followed.size
    totalFollowedSum += followedCount

    const isWon = t.status === 'closed' && t.pnl !== null && t.pnl > 0
    const isLost = t.status === 'closed' && t.pnl !== null && t.pnl <= 0
    const pnlVal = t.pnl ?? 0

    const bucket = countAcc[Math.min(followedCount, checkableCount)]
    bucket.trades++
    if (isWon)  { bucket.closed++; bucket.wins++; bucket.pnl += pnlVal }
    if (isLost) { bucket.closed++;               bucket.pnl += pnlVal }

    for (const item of checkable) {
      const slot = acc.get(item.id)!
      slot.total++
      if (followed.has(item.id)) {
        slot.followed++
        if (isWon)  { slot.winsF++;   slot.pnlF += pnlVal }
        if (isLost) { slot.lossesF++; slot.pnlF += pnlVal }
      } else {
        if (isWon)  slot.winsN++
        if (isLost) slot.lossesN++
      }
    }
  }

  const byItem: RuleItemStats[] = checkable.map((item) => {
    const s = acc.get(item.id)!
    const closedF = s.winsF + s.lossesF
    const closedN = s.winsN + s.lossesN
    return {
      id: item.id, label: item.label, number: item.number,
      letter: item.letter, parentLabel: item.parentLabel,
      followed: s.followed, total: s.total, rate: s.total > 0 ? s.followed / s.total : 0,
      winRateFollowed: closedF > 0 ? s.winsF / closedF : null,
      winRateNotFollowed: closedN > 0 ? s.winsN / closedN : null,
      pnlFollowed: s.pnlF, closedFollowed: closedF, closedNotFollowed: closedN,
    }
  })

  const byCount: RuleAdherenceGroup[] = countAcc.map((b, n) => ({
    n, trades: b.trades, closed: b.closed,
    winRate: b.closed > 0 ? b.wins / b.closed : null,
    pnl: parseFloat(b.pnl.toFixed(2)),
  }))

  const avgFollowed = trades.length > 0 ? totalFollowedSum / trades.length : null
  const avgRate = avgFollowed !== null && checkableCount > 0 ? avgFollowed / checkableCount : null
  return { totalTrades: trades.length, checkableCount, avgFollowed, avgRate, byItem, byCount }
}

function deriveResult(t: Trade): 'won' | 'lost' | 'open' {
  if (t.status !== 'closed') return 'open'
  if (t.pnl !== null) return t.pnl > 0 ? 'won' : 'lost'
  return 'open'
}

function emptyGroup(): GroupStats {
  return { count: 0, wins: 0, losses: 0, open: 0, pnl: 0, winRate: null, avgRR: null }
}

function finalizeGroup(g: GroupStats, rrSum: number, rrCnt: number) {
  const closed = g.wins + g.losses
  g.winRate = closed > 0 ? g.wins / closed : null
  g.avgRR   = rrCnt > 0 ? rrSum / rrCnt : null
}

function computeByDirection(trades: Trade[]): { long: GroupStats; short: GroupStats } {
  const acc = { long: emptyGroup(), short: emptyGroup() }
  const rr  = { long: { sum: 0, cnt: 0 }, short: { sum: 0, cnt: 0 } }
  for (const t of trades) {
    const g = acc[t.direction]; const r = deriveResult(t)
    g.count++
    if (r === 'won')  { g.wins++;   g.pnl += t.pnl ?? 0 }
    else if (r === 'lost') { g.losses++; g.pnl += t.pnl ?? 0 }
    else { g.open++ }
    if (t.r_multiple !== null) { rr[t.direction].sum += t.r_multiple; rr[t.direction].cnt++ }
  }
  finalizeGroup(acc.long,  rr.long.sum,  rr.long.cnt)
  finalizeGroup(acc.short, rr.short.sum, rr.short.cnt)
  return acc
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function computeByDOW(trades: Trade[]): Array<{ label: string; stats: GroupStats }> {
  const acc  = Array.from({ length: 7 }, () => emptyGroup())
  const rr   = Array.from({ length: 7 }, () => ({ sum: 0, cnt: 0 }))
  for (const t of trades) {
    const d = new Date(t.date).getDay(); const r = deriveResult(t)
    acc[d].count++
    if (r === 'won')  { acc[d].wins++;   acc[d].pnl += t.pnl ?? 0 }
    else if (r === 'lost') { acc[d].losses++; acc[d].pnl += t.pnl ?? 0 }
    else { acc[d].open++ }
    if (t.r_multiple !== null) { rr[d].sum += t.r_multiple; rr[d].cnt++ }
  }
  return acc.map((g, i) => { finalizeGroup(g, rr[i].sum, rr[i].cnt); return { label: DOW[i], stats: g } })
}

function computeByTicker(trades: Trade[]): Array<{ ticker: string; stats: GroupStats }> {
  const acc: Record<string, GroupStats> = {}
  const rr:  Record<string, { sum: number; cnt: number }> = {}
  for (const t of trades) {
    const k = t.symbol || 'Unknown'; const r = deriveResult(t)
    if (!acc[k]) { acc[k] = emptyGroup(); rr[k] = { sum: 0, cnt: 0 } }
    acc[k].count++
    if (r === 'won')  { acc[k].wins++;   acc[k].pnl += t.pnl ?? 0 }
    else if (r === 'lost') { acc[k].losses++; acc[k].pnl += t.pnl ?? 0 }
    else { acc[k].open++ }
    if (t.r_multiple !== null) { rr[k].sum += t.r_multiple; rr[k].cnt++ }
  }
  return Object.entries(acc)
    .map(([ticker, stats]) => { finalizeGroup(stats, rr[ticker].sum, rr[ticker].cnt); return { ticker, stats } })
    .sort((a, b) => (b.stats.wins + b.stats.losses + b.stats.open) - (a.stats.wins + a.stats.losses + a.stats.open))
}

/* ── sub-components ── */

function RRRow({ label, value, color }: { label: string; value: number | null; color: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-sm font-semibold ${color}`}>
        {value !== null ? `1:${value.toFixed(2)}` : '—'}
      </span>
    </div>
  )
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
    </div>
  )
}

function GroupRow({ label, stats, accent }: { label: string; stats: GroupStats; accent: string }) {
  return (
    <tr className="border-b border-slate-800/50">
      <td className={`py-2 font-semibold ${accent}`}>{label}</td>
      <td className="py-2 text-right text-slate-400">{stats.count > 0 ? stats.count : '—'}</td>
      <td className="py-2 text-right">
        {stats.count > 0 ? (
          <><span className="text-emerald-400">{stats.wins}</span><span className="text-slate-600 mx-1">/</span><span className="text-red-400">{stats.losses}</span></>
        ) : <span className="text-slate-600">—</span>}
      </td>
      <td className="py-2 text-right text-slate-300">
        {stats.winRate !== null ? pct(stats.winRate) : '—'}
      </td>
      <td className="py-2 text-right text-slate-300">
        {stats.avgRR !== null ? `1:${stats.avgRR.toFixed(2)}` : '—'}
      </td>
      <td className={`py-2 text-right font-semibold ${
        stats.count === 0 ? 'text-slate-600' : stats.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
      }`}>
        {stats.count === 0 ? '—' : `${stats.pnl >= 0 ? '+' : ''}$${Math.abs(stats.pnl).toFixed(2)}`}
      </td>
    </tr>
  )
}

const tableHead = (
  <thead>
    <tr className="border-b border-slate-800">
      {['Direction', 'Trades', 'W / L', 'Win Rate', 'Avg R:R', 'P&L'].map((h) => (
        <th key={h} className={`text-[10px] text-slate-500 uppercase tracking-wide pb-2 ${h === 'Direction' ? 'text-left' : 'text-right'}`}>{h}</th>
      ))}
    </tr>
  </thead>
)

const CHART_STYLE = { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8 }

function EquityTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { index: number; date: string; time: string; pnl: number } }> }) {
  if (!active || !payload?.length) return null
  const { date, time, pnl } = payload[0].payload
  const d = new Date(date)
  const label = isNaN(d.getTime()) ? date : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return (
    <div style={CHART_STYLE} className="px-3 py-2">
      <p className="text-slate-400 text-xs">{label}</p>
      {time && <p className="text-slate-500 text-[10px]">{time}</p>}
      <p className={`text-sm font-semibold mt-0.5 ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
        {pnl >= 0 ? '+' : ''}{usd2.format(pnl)}
      </p>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   Dashboard
   ════════════════════════════════════════════════════════════ */

type SubTab = 'overview' | 'breakdowns' | 'rules'

export default function Dashboard() {
  const { activeId } = usePortfolio()
  const [s, setS]         = useState<AnalyticsSummary | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [plan, setPlan]     = useState<PlanRule[]>([])
  const [loading, setLoading] = useState(true)
  const [subTab, setSubTab]   = useState<SubTab>('overview')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      window.api.analytics.getSummary(activeId),
      window.api.trades.getAll(activeId),
      window.api.settings.get(`trading_plan_${activeId}`),
    ]).then(([summary, all, planStr]) => {
      setS(summary)
      setTrades(all)
      if (planStr) { try { setPlan(JSON.parse(planStr)) } catch { /* keep empty */ } }
      setLoading(false)
    })
  }, [activeId])

  const byDirection = useMemo(() => computeByDirection(trades), [trades])
  const byDOW       = useMemo(() => computeByDOW(trades),       [trades])
  const byTicker    = useMemo(() => computeByTicker(trades),    [trades])

  const bestTrade  = useMemo(() =>
    trades.filter((t) => t.pnl !== null && t.pnl > 0)
      .reduce<Trade | null>((a, b) => (a === null || (b.pnl ?? 0) > (a.pnl ?? 0) ? b : a), null),
    [trades])

  const worstTrade = useMemo(() =>
    trades.filter((t) => t.pnl !== null && t.pnl < 0)
      .reduce<Trade | null>((a, b) => (a === null || (b.pnl ?? 0) < (a.pnl ?? 0) ? b : a), null),
    [trades])

  const rules = useMemo(() => calcRuleAnalytics(trades, plan), [trades, plan])

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-slate-500">Loading…</div>
  }
  if (!s) return null

  if (s.totalTrades < 5) {
    return (
      <div className="text-center py-16 text-slate-500">
        <p className="text-base mb-2">Analytics unlock after 5 saved trades.</p>
        <p className="text-sm">You have {s.totalTrades} trade{s.totalTrades !== 1 ? 's' : ''} saved.</p>
      </div>
    )
  }

  const streak = s.currentStreak
  const streakValue = streak.type === null ? '—' : `${streak.count} ${streak.type === 'win' ? 'W' : 'L'}`
  const streakColor = streak.type === null ? 'text-slate-400' : streak.type === 'win' ? 'text-emerald-400' : 'text-red-400'
  const pfColor = s.profitFactor === null ? 'text-slate-400' : s.profitFactor >= 2 ? 'text-emerald-400' : s.profitFactor >= 1 ? 'text-amber-400' : 'text-red-400'

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* ── Row 1 stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCell
          label="Total P&L"
          value={s.closedTrades > 0 ? `${s.totalPnl >= 0 ? '+' : ''}$${Math.abs(s.totalPnl).toFixed(2)}` : '—'}
          color={s.closedTrades === 0 ? 'text-slate-400' : s.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}
        />
        <SummaryCell
          label="Expectancy / trade"
          value={s.expectancy !== null ? `${s.expectancy >= 0 ? '+' : ''}$${s.expectancy.toFixed(2)}` : '—'}
          color={s.expectancy === null ? 'text-slate-400' : s.expectancy >= 0 ? 'text-emerald-400' : 'text-red-400'}
        />
        <SummaryCell
          label="Win Rate"
          value={s.winRate !== null ? pct(s.winRate) : '—'}
          color={s.winRate === null ? 'text-slate-400' : s.winRate >= 0.5 ? 'text-emerald-400' : 'text-red-400'}
        />
        <SummaryCell
          label="Max Drawdown"
          value={s.maxDrawdown > 0 ? `-$${s.maxDrawdown.toFixed(2)}` : '—'}
          color={s.maxDrawdown > 0 ? 'text-red-400' : 'text-slate-400'}
        />
      </div>

      {/* ── Row 2 stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCell
          label="Profit Factor"
          value={s.profitFactor !== null ? s.profitFactor.toFixed(2) : '—'}
          color={pfColor}
        />
        <SummaryCell
          label="Avg Win"
          value={s.avgWinDollar !== null ? `+${usd2.format(s.avgWinDollar)}` : '—'}
          color={s.avgWinDollar !== null ? 'text-emerald-400' : 'text-slate-400'}
        />
        <SummaryCell
          label="Avg Loss"
          value={s.avgLossDollar !== null ? `-${usd2.format(s.avgLossDollar)}` : '—'}
          color={s.avgLossDollar !== null ? 'text-red-400' : 'text-slate-400'}
        />
        <SummaryCell
          label="Current Streak"
          value={streakValue}
          color={streakColor}
        />
      </div>

      {/* ── Equity Curve ── */}
      {s.equityCurve.length >= 2 && (
        <div className="bg-dark-surface border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Equity Curve</h3>
            <p className={`text-sm font-bold ${s.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {s.totalPnl >= 0 ? '+' : ''}${s.totalPnl.toFixed(2)}
            </p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={s.equityCurve}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="index"
                stroke="#475569"
                tick={{ fontSize: 10 }}
                tickFormatter={(idx) => {
                  const pt = s.equityCurve[idx as number]
                  if (!pt) return ''
                  const d = new Date(pt.date)
                  return isNaN(d.getTime()) ? pt.date.slice(5) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                }}
              />
              <YAxis stroke="#475569" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip content={<EquityTooltip />} />
              <Line type="monotone" dataKey="pnl" stroke={s.totalPnl >= 0 ? '#10b981' : '#ef4444'} dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Sub-tab bar ── */}
      <div className="flex gap-1 bg-dark-elevated border border-slate-700 rounded-lg p-1 w-fit">
        {(['overview', 'breakdowns', 'rules'] as SubTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors capitalize ${
              subTab === t ? 'bg-dark-surface text-white' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {subTab === 'overview' && (
        <div className="space-y-4">

          {/* Trade breakdown + R:R side by side */}
          <div className="bg-dark-surface border border-slate-800 rounded-2xl p-5 grid sm:grid-cols-2 gap-x-6 gap-y-4">
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Trade Breakdown</h3>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <MiniStat label="Won"  value={s.wonCount}   color="text-emerald-400" />
                <MiniStat label="Lost" value={s.lostCount}  color="text-red-400" />
                <MiniStat label="Open" value={s.openTrades} color="text-slate-400" />
              </div>
              {s.closedTrades > 0 && s.winRate !== null && (
                <div>
                  <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                    <span>Win rate</span><span>{pct(s.winRate)}</span>
                  </div>
                  <div className="h-1.5 bg-dark-elevated rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${s.winRate * 100}%` }} />
                  </div>
                </div>
              )}
            </div>

            <div className="sm:border-l sm:border-slate-800 sm:pl-6 border-t border-slate-800 pt-4 sm:border-t-0 sm:pt-0">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">R:R Analysis</h3>
              <div className="space-y-2">
                <RRRow label="All trades" value={s.avgR}      color="text-white" />
                <RRRow label="On wins"    value={s.avgWinRR}  color="text-emerald-400" />
                <RRRow label="On losses"  value={s.avgLossRR} color="text-red-400" />
              </div>
            </div>
          </div>

          {/* Long vs Short */}
          <div className="bg-dark-surface border border-slate-800 rounded-2xl p-5">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Long vs Short</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                {tableHead}
                <tbody>
                  <GroupRow label="↑ Long"  stats={byDirection.long}  accent="text-emerald-400" />
                  <GroupRow label="↓ Short" stats={byDirection.short} accent="text-amber-400" />
                </tbody>
              </table>
            </div>
          </div>

          {/* Best / Worst */}
          {(bestTrade || worstTrade) && (
            <div className="grid sm:grid-cols-2 gap-4">
              {bestTrade && (
                <div className="bg-dark-surface border border-emerald-900/40 rounded-2xl p-5">
                  <p className="text-xs text-emerald-600 uppercase tracking-wide font-semibold mb-2">Best Trade</p>
                  <p className="text-lg font-bold text-emerald-400">+{usd2.format(bestTrade.pnl!)}</p>
                  <p className="text-sm text-slate-400 mt-1">
                    {bestTrade.symbol !== 'N/A' ? `$${bestTrade.symbol} · ` : ''}
                    {bestTrade.r_multiple !== null ? `${bestTrade.r_multiple.toFixed(2)}R` : ''}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{new Date(bestTrade.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                </div>
              )}
              {worstTrade && (
                <div className="bg-dark-surface border border-red-900/40 rounded-2xl p-5">
                  <p className="text-xs text-red-600 uppercase tracking-wide font-semibold mb-2">Worst Loss</p>
                  <p className="text-lg font-bold text-red-400">{usd2.format(worstTrade.pnl!)}</p>
                  <p className="text-sm text-slate-400 mt-1">
                    {worstTrade.symbol !== 'N/A' ? `$${worstTrade.symbol} · ` : ''}
                    {worstTrade.r_multiple !== null ? `${worstTrade.r_multiple.toFixed(2)}R` : ''}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{new Date(worstTrade.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Breakdowns ── */}
      {subTab === 'breakdowns' && (
        <div className="space-y-4">

          {/* Day of Week */}
          <div className="bg-dark-surface border border-slate-800 rounded-2xl p-5">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Day of Week</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                {tableHead}
                <tbody>
                  {byDOW.map(({ label, stats }) => (
                    <GroupRow key={label} label={label} stats={stats} accent="text-white" />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* By Ticker */}
          {byTicker.length > 1 && (
            <div className="bg-dark-surface border border-slate-800 rounded-2xl p-5">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">By Ticker</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  {tableHead}
                  <tbody>
                    {byTicker.map(({ ticker, stats }) => (
                      <GroupRow
                        key={ticker}
                        label={ticker === 'N/A' || ticker === 'Unknown' ? '—' : `$${ticker}`}
                        stats={stats}
                        accent="text-white"
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Monthly P&L */}
          {s.monthlyPnl.length > 0 && (
            <div className="bg-dark-surface border border-slate-800 rounded-2xl p-5">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Monthly P&L</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800">
                      {['Month', 'P&L'].map((h) => (
                        <th key={h} className={`text-[10px] text-slate-500 uppercase tracking-wide pb-2 ${h === 'Month' ? 'text-left' : 'text-right'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {s.monthlyPnl.map(({ month, pnl }) => (
                      <tr key={month} className="border-b border-slate-800/50">
                        <td className="py-2 font-semibold text-white">{month}</td>
                        <td className={`py-2 text-right font-semibold ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Rules ── */}
      {subTab === 'rules' && <RulesPane rules={rules} plan={plan} />}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   RulesPane
   ════════════════════════════════════════════════════════════ */

function RulesPane({ rules, plan }: { rules: RuleAnalytics; plan: PlanRule[] }) {
  if (plan.length === 0) {
    return (
      <div className="text-center py-16 text-slate-500">
        <p className="text-sm mb-1">No trading plan yet.</p>
        <p className="text-xs">Build a plan in the Plan tab, then come back once you have trades with rules logged.</p>
      </div>
    )
  }

  const tradesWithData = rules.byCount.slice(1).reduce((s, g) => s + g.trades, 0)

  if (rules.totalTrades === 0) {
    return <div className="text-center py-16 text-slate-500 text-sm">No trades yet.</div>
  }

  const pnlSign  = (v: number) => `${v >= 0 ? '+' : ''}$${Math.abs(v).toFixed(2)}`
  const pnlColor = (v: number) => v >= 0 ? 'text-emerald-400' : 'text-red-400'

  return (
    <div className="space-y-4">

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCell label="Plan rules"        value={String(rules.checkableCount)}  color="text-slate-200" />
        <SummaryCell label="Trades with rules" value={tradesWithData > 0 ? String(tradesWithData) : '—'} color="text-slate-200" />
        <SummaryCell
          label="Avg adherence"
          value={rules.avgFollowed !== null ? `${rules.avgFollowed.toFixed(1)} / ${rules.checkableCount}` : '—'}
          color="text-slate-200"
        />
        <SummaryCell
          label="Adherence rate"
          value={rules.avgRate !== null ? pct(rules.avgRate) : '—'}
          color={rules.avgRate === null ? 'text-slate-400' : rules.avgRate >= 0.8 ? 'text-emerald-400' : rules.avgRate >= 0.5 ? 'text-amber-400' : 'text-red-400'}
        />
      </div>

      {tradesWithData === 0 && (
        <div className="bg-dark-surface border border-slate-800 rounded-2xl p-5 text-center">
          <p className="text-sm text-slate-400 mb-1">No rule-tagged trades yet.</p>
          <p className="text-xs text-slate-600">Check off rules in the calculator before saving trades, or update existing trades via the edit menu in the journal.</p>
        </div>
      )}

      {/* Per-rule table */}
      {rules.byItem.length > 0 && (
        <div className="bg-dark-surface border border-slate-800 rounded-2xl p-5">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Per Rule</h3>
          <p className="text-[11px] text-slate-600 mb-3 leading-relaxed">
            Win rate delta = when followed minus when skipped. Positive means following this rule correlates with better outcomes.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  {['Rule', 'Followed', 'Win% ✓', 'Win% ✗', 'Δ Win%', 'P&L ✓'].map((h) => (
                    <th key={h} className={`text-[10px] text-slate-500 uppercase tracking-wide pb-2 ${h === 'Rule' ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rules.byItem.map((item) => {
                  const delta = item.winRateFollowed !== null && item.winRateNotFollowed !== null
                    ? item.winRateFollowed - item.winRateNotFollowed : null
                  return (
                    <tr key={item.id} className="border-b border-slate-800/50">
                      <td className="py-2 max-w-[160px]">
                        {item.parentLabel && (
                          <span className="text-[10px] text-slate-600 block leading-none mb-0.5">{item.number}. {item.parentLabel}</span>
                        )}
                        <span className="text-xs font-semibold text-white">
                          {item.parentLabel ? `${item.letter}. ` : `${item.number}. `}{item.label}
                        </span>
                      </td>
                      <td className="py-2 text-right text-slate-400 text-xs">
                        {item.followed}/{item.total}
                        <span className="text-slate-600 ml-1">({pct(item.rate)})</span>
                      </td>
                      <td className="py-2 text-right text-xs text-emerald-400">
                        {item.winRateFollowed !== null ? pct(item.winRateFollowed) : '—'}
                      </td>
                      <td className="py-2 text-right text-xs text-red-400">
                        {item.winRateNotFollowed !== null ? pct(item.winRateNotFollowed) : '—'}
                      </td>
                      <td className={`py-2 text-right text-xs font-semibold ${delta === null ? 'text-slate-600' : delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                        {delta === null ? '—' : `${delta >= 0 ? '+' : ''}${pct(delta)}`}
                      </td>
                      <td className={`py-2 text-right text-xs font-semibold ${item.closedFollowed === 0 ? 'text-slate-600' : pnlColor(item.pnlFollowed)}`}>
                        {item.closedFollowed === 0 ? '—' : pnlSign(item.pnlFollowed)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* By rules followed count */}
      {rules.byCount.some((g) => g.trades > 0) && (
        <div className="bg-dark-surface border border-slate-800 rounded-2xl p-5">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">By Rules Followed</h3>
          <p className="text-[11px] text-slate-600 mb-3 leading-relaxed">
            Outcome split by how many plan items were checked before the trade.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  {['Rules followed', 'Trades', 'Win rate', 'P&L'].map((h) => (
                    <th key={h} className={`text-[10px] text-slate-500 uppercase tracking-wide pb-2 ${h === 'Rules followed' ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rules.byCount.map((g) => {
                  if (g.trades === 0) return null
                  const label = g.n === 0 ? 'None (0)' : g.n === rules.checkableCount ? `All (${g.n})` : String(g.n)
                  return (
                    <tr key={g.n} className="border-b border-slate-800/50">
                      <td className="py-2 font-semibold text-white text-xs">{label}</td>
                      <td className="py-2 text-right text-slate-400 text-xs">{g.trades}</td>
                      <td className={`py-2 text-right text-xs font-semibold ${g.winRate === null ? 'text-slate-600' : g.winRate >= 0.5 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {g.winRate !== null ? pct(g.winRate) : '—'}
                      </td>
                      <td className={`py-2 text-right text-xs font-semibold ${g.closed === 0 ? 'text-slate-600' : pnlColor(g.pnl)}`}>
                        {g.closed === 0 ? '—' : pnlSign(g.pnl)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
