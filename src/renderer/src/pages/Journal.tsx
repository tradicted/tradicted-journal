import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import type { Trade, TagDefinition, GradeDefinition, PlanRule } from '../types'
import { usePortfolio } from '../context/PortfolioContext'
import { TagChips } from '../components/TagChips'
import { GradeSelector } from '../components/GradeSelector'
import { RuleChecklist } from '../components/RuleChecklist'
import { SummaryCell } from '../components/SummaryCell'
import { calcPnlFromTrade, calcRMultipleFromTrade } from '../utils'
import { CalendarView } from '../components/CalendarView'

const DEFAULT_SETUP_TAGS: TagDefinition[] = [
  { id: 'breakout', label: 'Breakout', color: '#22d3ee' },
  { id: 'reversal', label: 'Reversal', color: '#f97316' },
  { id: 'support-resistance', label: 'S / R', color: '#6366f1' },
  { id: 'gap', label: 'Gap', color: '#a78bfa' },
  { id: 'momentum', label: 'Momentum', color: '#10b981' },
  { id: 'vwap', label: 'VWAP', color: '#1e99dc' },
  { id: 'other', label: 'Other', color: '#64748b' },
]

const DEFAULT_PSYCH_TAGS: TagDefinition[] = [
  { id: 'disciplined', label: 'Disciplined', color: '#4ade80' },
  { id: 'rule-based', label: 'Rule-based', color: '#34d399' },
  { id: 'fomo', label: 'FOMO', color: '#f87171' },
  { id: 'revenge', label: 'Revenge', color: '#ef4444' },
  { id: 'hesitated', label: 'Hesitated', color: '#fbbf24' },
  { id: 'overconfident', label: 'Overconfident', color: '#fb923c' },
]

const DEFAULT_GRADES: GradeDefinition[] = [
  { id: 'A', label: 'A', color: '#4ade80' },
  { id: 'B', label: 'B', color: '#fbbf24' },
  { id: 'C', label: 'C', color: '#f87171' },
]

type ResultFilter = 'all' | 'won' | 'lost' | 'open'
type DirectionFilter = 'all' | 'long' | 'short'

function deriveResult(t: Trade): 'won' | 'lost' | 'open' {
  if (t.status !== 'closed') return 'open'
  if (t.pnl !== null) return t.pnl > 0 ? 'won' : 'lost'
  return 'open'
}

function fmtDate(t: Trade): string {
  const src = t.created_at || t.date
  const d = new Date(src)
  if (isNaN(d.getTime())) return t.date
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function calcStats(trades: Trade[]) {
  const closed = trades.filter((t) => t.status === 'closed')
  const won = closed.filter((t) => (t.pnl ?? 0) > 0)
  const pnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0)
  const winRate = closed.length > 0 ? won.length / closed.length : null
  const withR = closed.filter((t) => t.r_multiple !== null)
  const avgRR = withR.length > 0 ? withR.reduce((s, t) => s + (t.r_multiple ?? 0), 0) / withR.length : null
  let maxDD = 0, runDD = 0
  for (const t of closed) {
    const p = t.pnl ?? 0
    if (p < 0) { runDD += Math.abs(p); if (runDD > maxDD) maxDD = runDD }
    else runDD = 0
  }
  return { pnl, winRate, avgRR, maxDD, closedCount: closed.length }
}

const inputCls = 'w-full bg-dark-bg border border-slate-700 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-slate-500 transition-colors'

/* ════════════════════════════════════════════
   ResultSlider — compact Won/Open/Lost control
   ════════════════════════════════════════════ */

function ResultSlider({
  result,
  onResult,
}: {
  result: 'won' | 'lost' | 'open'
  onResult: (r: 'won' | 'lost' | 'open', e: React.MouseEvent) => void
}) {
  const positions = { won: 0, open: 1, lost: 2 } as const
  const pos = positions[result]
  const pegColor =
    result === 'won' ? '#4ade80' : result === 'lost' ? '#f87171' : '#94a3b8'

  // Container is 60px wide, 3 equal segments → dot centers at 10, 30, 50px
  // Peg is 12px wide → left edge = center - 6px → 4, 24, 44px
  const pegLeft = [4, 24, 44][pos]

  return (
    <div
      className="relative flex items-center select-none"
      style={{ width: 60 }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Track line */}
      <div className="absolute inset-x-2.5 top-1/2 -translate-y-1/2 h-px bg-slate-600" />
      {/* Three dot stops */}
      {(['won', 'open', 'lost'] as const).map((r) => (
        <button
          key={r}
          onClick={(e) => onResult(r, e)}
          className="relative z-10 flex-1 flex justify-center py-2"
          aria-label={r}
        >
          <span
            className="block w-1.5 h-1.5 rounded-full transition-colors"
            style={{ backgroundColor: '#475569' }}
          />
        </button>
      ))}
      {/* Sliding peg */}
      <span
        className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-dark-surface transition-all duration-200 pointer-events-none z-20"
        style={{ backgroundColor: pegColor, left: pegLeft }}
      />
    </div>
  )
}

/* ════════════════════════════════════════════
   JournalTradeCard
   ════════════════════════════════════════════ */

interface CardProps {
  trade: Trade
  setupTags: TagDefinition[]
  psychTags: TagDefinition[]
  grades: GradeDefinition[]
  plan: PlanRule[]
  commission: number
  compact: boolean
  onReload: () => void
  editingId: number | null
  setEditingId: (id: number | null) => void
}

function JournalTradeCard({ trade: t, setupTags, psychTags, grades, plan, commission, compact, onReload, editingId, setEditingId }: CardProps) {
  const editing = editingId === t.id
  const cardRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const riskPs = t.entry_price > 0 && t.stop_loss ? Math.abs(t.entry_price - t.stop_loss) : 0
  const rewardPs = t.entry_price > 0 && t.take_profit ? Math.abs(t.take_profit - t.entry_price) : 0
  const plannedRR = riskPs > 0 ? rewardPs / riskPs : (t.r_multiple ?? 0)
  const dollarRisk = riskPs * t.position_size
  const dollarReward = rewardPs * t.position_size
  const breakEven = plannedRR > 0 ? 1 / (1 + plannedRR) : 0
  const result = deriveResult(t)
  const isLong = t.direction === 'long'

  const rulesFollowedIds: string[] = (() => {
    try { return JSON.parse(t.rules_followed || '[]') } catch { return [] }
  })()

  type EditState = {
    ticker: string; entry: string; stop: string; tp: string
    actualExit: string; shares: string; notes: string
    setupTag: string | null; psychTag: string | null; grade: string | null
    rulesFollowed: string[]
    openedAt: string; closedAt: string
  }

  // Convert a stored datetime string to local datetime-local input value (YYYY-MM-DDTHH:MM)
  function toDatetimeLocal(src: string | null | undefined): string {
    if (!src) return ''
    const d = new Date(src)
    if (isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const buildEdit = (): EditState => ({
    ticker: t.symbol === 'N/A' ? '' : t.symbol,
    entry: String(t.entry_price),
    stop: t.stop_loss != null ? String(t.stop_loss) : '',
    tp: t.take_profit != null ? String(t.take_profit) : '',
    actualExit: t.exit_price != null ? String(t.exit_price) : '',
    shares: String(t.position_size),
    notes: t.notes ?? '',
    setupTag: t.setup_tag ?? null,
    psychTag: t.psych_tag ?? null,
    grade: t.grade ?? null,
    rulesFollowed: rulesFollowedIds,
    openedAt: toDatetimeLocal(t.date || t.created_at),
    closedAt: toDatetimeLocal(t.closed_at),
  })
  const [edit, setEdit] = useState<EditState>(buildEdit)

  const eNum = parseFloat(edit.entry) || 0
  const sNum = parseFloat(edit.stop) || 0
  const tNum = parseFloat(edit.tp) || 0
  const exitNum = edit.actualExit.trim() === '' ? null : parseFloat(edit.actualExit)
  const exitValid = exitNum !== null && !isNaN(exitNum) && exitNum > 0
  const sharesNum = parseFloat(edit.shares) || 0
  const liveRps = eNum > 0 && sNum > 0 ? Math.abs(eNum - sNum) : 0
  const liveRwps = eNum > 0 && tNum > 0 ? Math.abs(tNum - eNum) : 0
  const liveRR = liveRps > 0 ? liveRwps / liveRps : 0
  const liveRisk = sharesNum * liveRps
  const liveReward = sharesNum * liveRwps
  const liveBE = liveRR > 0 ? 1 / (1 + liveRR) : 0
  const editValid = eNum > 0 && sNum > 0 && tNum > 0 && sharesNum > 0 && liveRps > 0
  const liveIsLong = tNum > eNum
  const liveRealPs = exitValid ? Math.abs(exitNum! - eNum) : 0
  const liveRealRR = exitValid && liveRps > 0 ? liveRealPs / liveRps : 0
  const liveRealPnl = exitValid ? (liveIsLong ? exitNum! - eNum : eNum - exitNum!) * sharesNum : 0
  const exitIsWin = exitValid ? (liveIsLong ? exitNum! > eNum : exitNum! < eNum) : null

  async function doSave(s: EditState) {
    const e2 = parseFloat(s.entry) || 0
    const s2 = parseFloat(s.stop) || 0
    const tp2 = parseFloat(s.tp) || 0
    const sh2 = parseFloat(s.shares) || 0
    const rps2 = e2 > 0 && s2 > 0 ? Math.abs(e2 - s2) : 0
    if (!(e2 > 0 && s2 > 0 && tp2 > 0 && sh2 > 0 && rps2 > 0)) return
    const ex2 = s.actualExit.trim() === '' ? null : parseFloat(s.actualExit)
    const exitOk = ex2 !== null && !isNaN(ex2) && ex2 > 0
    const exitToSave = exitOk ? ex2 : null
    const direction: 'long' | 'short' = tp2 > e2 ? 'long' : 'short'
    const rr2 = rps2 > 0 ? Math.abs(tp2 - e2) / rps2 : 0
    const pnlCalc = exitToSave !== null
      ? calcPnlFromTrade({ entry_price: e2, exit_price: exitToSave, position_size: sh2, direction })
      : null
    const rCalc = exitToSave !== null
      ? calcRMultipleFromTrade({ entry_price: e2, exit_price: exitToSave, stop_loss: s2, position_size: sh2, direction })
      : rr2
    // Convert datetime-local string back to ISO for storage
    const openedAtIso = s.openedAt ? new Date(s.openedAt).toISOString() : null
    const closedAtIso = s.closedAt ? new Date(s.closedAt).toISOString() : null
    await window.api.trades.update(t.id, {
      symbol: s.ticker.trim().toUpperCase() || 'N/A',
      entry_price: e2, stop_loss: s2 || null, take_profit: tp2 || null,
      exit_price: exitToSave, position_size: sh2, direction,
      status: exitToSave !== null ? 'closed' : t.status,
      pnl: pnlCalc, r_multiple: rCalc,
      notes: s.notes.trim() || null,
      setup_tag: s.setupTag, psych_tag: s.psychTag, grade: s.grade,
      rules_followed: JSON.stringify(s.rulesFollowed),
      ...(openedAtIso ? { date: openedAtIso } : {}),
      closed_at: closedAtIso,
    })
    onReload()
  }

  function scheduleSave(nextEdit: EditState) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => doSave(nextEdit), 300)
  }

  function updateEdit(updater: (s: EditState) => EditState) {
    setEdit((s) => {
      const next = updater(s)
      scheduleSave(next)
      return next
    })
  }

  function closeCard() {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    doSave(edit)
    setEditingId(null)
  }

  // Click-outside to close edit mode.
  // Must use 'click' (not 'mousedown') so that clicking another card works:
  // the other card opens on its onMouseDown, then this click handler fires —
  // by that point editing is already false so the handler is not even attached.
  useEffect(() => {
    if (!editing) return
    const handler = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        closeCard()
      }
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, edit])

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Delete this trade? This cannot be undone.')) return
    await window.api.trades.delete(t.id)
    onReload()
  }

  async function handleResult(e: React.MouseEvent, r: 'won' | 'lost' | 'open') {
    e.stopPropagation()
    if (r === 'open') {
      await window.api.trades.update(t.id, { status: 'open', exit_price: null, pnl: null, r_multiple: null })
    } else {
      // Always use the canonical exit for the chosen result so deriveResult() reflects it correctly
      const exitPrice = r === 'won' ? (t.take_profit ?? t.exit_price) : (t.stop_loss ?? t.exit_price)
      const direction = t.direction
      const pnlCalc = exitPrice != null
        ? calcPnlFromTrade({ entry_price: t.entry_price, exit_price: exitPrice, position_size: t.position_size, direction })
        : null
      const rCalc = exitPrice != null && t.stop_loss != null
        ? calcRMultipleFromTrade({ entry_price: t.entry_price, exit_price: exitPrice, stop_loss: t.stop_loss, position_size: t.position_size, direction })
        : null
      await window.api.trades.update(t.id, { status: 'closed', exit_price: exitPrice, pnl: pnlCalc, r_multiple: rCalc })
    }
    onReload()
  }

  const setupDef = setupTags.find((tag) => tag.id === t.setup_tag)
  const psychDef = psychTags.find((tag) => tag.id === t.psych_tag)
  const gradeDef = grades.find((g) => g.id === t.grade)

  return (
    <div
      ref={cardRef}
      className={`group relative bg-dark-surface border border-slate-800 rounded-2xl p-5 transition-colors ${
        editing ? 'border-slate-600' : 'hover:border-slate-600 cursor-pointer'
      }`}
      onMouseDown={() => {
        if (!editing) { setEdit(buildEdit()); setEditingId(t.id) }
      }}
    >
      <button
        onClick={handleDelete}
        className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-opacity z-10 opacity-0 group-hover:opacity-100"
        aria-label="Delete trade"
      >
        <span className="text-white text-[11px] font-bold leading-none">×</span>
      </button>
      {editing ? (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Edit Trade</p>

          <div className="grid grid-cols-3 gap-2 mb-2">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Ticker</label>
              <input className={inputCls} value={edit.ticker} onChange={(e) => updateEdit((s) => ({ ...s, ticker: e.target.value.toUpperCase() }))} placeholder="AAPL" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Entry</label>
              <input className={inputCls} type="number" step="any" value={edit.entry} onChange={(e) => updateEdit((s) => ({ ...s, entry: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Stop Loss</label>
              <input className={inputCls} type="number" step="any" value={edit.stop} onChange={(e) => updateEdit((s) => ({ ...s, stop: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-2">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Take Profit</label>
              <input className={inputCls} type="number" step="any" value={edit.tp} onChange={(e) => updateEdit((s) => ({ ...s, tp: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Actual Exit <span className="text-slate-600">(optional)</span></label>
              <input className={inputCls} type="number" step="any" value={edit.actualExit} onChange={(e) => updateEdit((s) => ({ ...s, actualExit: e.target.value }))} placeholder="If different from TP" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Units / Shares</label>
              <input className={inputCls} type="number" step="any" value={edit.shares} onChange={(e) => updateEdit((s) => ({ ...s, shares: e.target.value }))} />
            </div>
          </div>

          <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">Set Actual Exit if you closed at a different price than TP. Analytics uses this for realized R.</p>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Opened</label>
              <input className={inputCls} type="datetime-local" value={edit.openedAt} onChange={(e) => updateEdit((s) => ({ ...s, openedAt: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Closed <span className="text-slate-600">(optional)</span></label>
              <input className={inputCls} type="datetime-local" value={edit.closedAt} onChange={(e) => updateEdit((s) => ({ ...s, closedAt: e.target.value }))} />
            </div>
          </div>

          <div className="mb-3">
            <label className="block text-xs text-slate-500 mb-1">Notes</label>
            <textarea className={`${inputCls} resize-none`} rows={2} value={edit.notes} onChange={(e) => updateEdit((s) => ({ ...s, notes: e.target.value }))} placeholder="Entry reason, observations..." />
          </div>

          <div className="mb-3">
            <TagChips label="Setup" tags={setupTags} value={edit.setupTag} onChange={(next) => updateEdit((s) => ({ ...s, setupTag: next }))} />
          </div>
          <div className="mb-3">
            <TagChips label="Psychology" tags={psychTags} value={edit.psychTag} onChange={(next) => updateEdit((s) => ({ ...s, psychTag: next }))} />
          </div>
          <div className="mb-3">
            <GradeSelector grades={grades} value={edit.grade} onChange={(next) => updateEdit((s) => ({ ...s, grade: next }))} />
          </div>

          {plan.length > 0 && (
            <div className="mb-4 p-3 bg-dark-elevated rounded-xl border border-slate-800">
              <p className="text-xs font-medium text-slate-400 mb-2">Trading Plan — Rules Followed</p>
              <RuleChecklist plan={plan} checkedIds={edit.rulesFollowed} onChange={(ids) => updateEdit((s) => ({ ...s, rulesFollowed: ids }))} />
            </div>
          )}

          {editValid && (
            <div className="text-xs mb-3 p-2.5 bg-dark-elevated rounded-lg space-y-1.5">
              <div className="flex flex-wrap gap-3">
                <span className="text-slate-500">Planned:</span>
                <span className="text-slate-300">R:R <strong className="text-white">1:{liveRR.toFixed(2)}</strong></span>
                <span className="text-red-400">Risk ${liveRisk.toFixed(2)}</span>
                <span className="text-emerald-400">Reward ${liveReward.toFixed(2)}</span>
                <span className="text-slate-400">BE {(liveBE * 100).toFixed(1)}%</span>
              </div>
              {exitValid && (
                <div className="flex flex-wrap gap-3 pt-1.5 border-t border-slate-700/50">
                  <span className="text-slate-500">Realized:</span>
                  <span className="text-slate-300">R:R <strong className="text-white">1:{liveRealRR.toFixed(2)}</strong></span>
                  <span className={exitIsWin ? 'text-emerald-400' : 'text-red-400'}>
                    {exitIsWin ? '+' : '-'}${Math.abs(liveRealPnl).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div>
          {/* Header row — always visible */}
          <div className={`flex items-center justify-between gap-2 ${compact ? '' : 'mb-3'}`}>
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              {t.symbol && t.symbol !== 'N/A' ? (
                <span className="text-lg font-bold text-white">${t.symbol}</span>
              ) : (
                <span className="text-lg font-bold text-slate-500">—</span>
              )}
              <span className="text-xs font-semibold text-slate-500">1:{plannedRR.toFixed(2)}R</span>
              <span className={`px-1.5 py-0.5 inline-flex items-center gap-0.5 rounded border text-[10px] font-bold uppercase tracking-wide ${
                isLong
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-400'
              }`}>
                <span aria-hidden="true">{isLong ? '↑' : '↓'}</span>
                {isLong ? 'Long' : 'Short'}
              </span>
              {t.setup_tag && setupDef && (
                <span
                  className="px-2 py-0.5 rounded-md border text-[11px] font-medium"
                  style={{ color: setupDef.color, borderColor: `${setupDef.color}66`, backgroundColor: `${setupDef.color}1a` }}
                >
                  {setupDef.label}
                </span>
              )}
              {t.psych_tag && psychDef && (
                <span
                  className="px-2 py-0.5 rounded-md border text-[11px] font-medium"
                  style={{ color: psychDef.color, borderColor: `${psychDef.color}66`, backgroundColor: `${psychDef.color}1a` }}
                >
                  {psychDef.label}
                </span>
              )}
              {t.grade && gradeDef && (
                <span
                  className="w-5 h-5 inline-flex items-center justify-center rounded border text-[10px] font-bold"
                  style={{ color: gradeDef.color, borderColor: gradeDef.color, backgroundColor: `${gradeDef.color}26` }}
                >
                  {gradeDef.label}
                </span>
              )}
              {compact && (
                <ResultSlider result={result} onResult={(r, e) => handleResult(e, r)} />
              )}
            </div>
            <div className="flex items-center flex-shrink-0">
              <span className="text-xs text-slate-500">{fmtDate(t)}</span>
            </div>
          </div>

          {!compact && (
            <>
              {/* Prices */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm mb-2 text-slate-400">
                <span>Entry: ${t.entry_price.toFixed(2)}</span>
                {t.stop_loss != null && <span>SL: ${t.stop_loss.toFixed(2)}</span>}
                {t.take_profit != null && <span>TP: ${t.take_profit.toFixed(2)}</span>}
                {t.exit_price != null && <span className="text-slate-200">Exit: <strong>${t.exit_price.toFixed(2)}</strong></span>}
              </div>

              {/* Dollar stats */}
              {riskPs > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm mb-2">
                  <span className="text-white">Risk: ${dollarRisk.toFixed(2)}</span>
                  <span className="text-white">Reward: ${dollarReward.toFixed(2)}</span>
                  <span className="text-slate-400">{t.position_size} units</span>
                  <span className="text-slate-400">BE: {(breakEven * 100).toFixed(1)}%</span>
                </div>
              )}

              {/* Realized P&L */}
              {t.pnl !== null && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-3 pt-2 border-t border-slate-800">
                  <span className="text-slate-500">Realized:</span>
                  {t.r_multiple !== null && <span className="text-slate-300">R: {t.r_multiple >= 0 ? '+' : ''}{t.r_multiple.toFixed(2)}R</span>}
                  <span className={t.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    P&L {t.pnl >= 0 ? '+' : ''}{Math.abs(t.pnl).toFixed(2)}
                  </span>
                  {commission > 0 && <span className="text-slate-500">(incl. ${commission.toFixed(2)} fees)</span>}
                </div>
              )}

              {/* Notes */}
              {t.notes && (
                <p className="text-xs text-slate-500 italic mb-3 leading-relaxed">{t.notes}</p>
              )}

              {/* Result toggle */}
              <div className="flex gap-2 mt-3">
                {(['won', 'open', 'lost'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={(e) => handleResult(e, r)}
                    className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-colors capitalize ${
                      result === r && r === 'won'  ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400'
                      : result === r && r === 'lost' ? 'bg-red-500/15 border-red-500 text-red-400'
                      : result === r && r === 'open' ? 'bg-slate-700/50 border-slate-500 text-slate-300'
                      : 'bg-transparent border-slate-800 text-slate-600 hover:border-slate-600 hover:text-slate-400'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════
   Journal page
   ════════════════════════════════════════════ */

export default function Journal() {
  const { activeId } = usePortfolio()
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [setupTags, setSetupTags] = useState<TagDefinition[]>(DEFAULT_SETUP_TAGS)
  const [psychTags, setPsychTags] = useState<TagDefinition[]>(DEFAULT_PSYCH_TAGS)
  const [grades, setGrades] = useState<GradeDefinition[]>(DEFAULT_GRADES)
  const [plan, setPlan] = useState<PlanRule[]>([])
  const [commission, setCommission] = useState(0)
  const [visibleCount, setVisibleCount] = useState(10)

  const [resultFilter, setResultFilter] = useState<ResultFilter>('all')
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('all')
  const [setupFilter, setSetupFilter] = useState<string>('all')
  const [psychFilter, setPsychFilter] = useState<string>('all')
  const [gradeFilter, setGradeFilter] = useState<string>('all')
  const [tickerQuery, setTickerQuery] = useState('')

  const loadAll = useCallback(async () => {
    const [tradesData, setupStr, psychStr, gradesStr, planStr, commStr, viewStr] = await Promise.all([
      window.api.trades.getAll(activeId),
      window.api.settings.get('setupTags'),
      window.api.settings.get('psychTags'),
      window.api.settings.get('grades'),
      window.api.settings.get(`trading_plan_${activeId}`),
      window.api.settings.get('commission'),
      window.api.settings.get('journalView'),
    ])
    setTrades(tradesData)
    if (setupStr) { try { setSetupTags(JSON.parse(setupStr)) } catch { /* keep default */ } }
    if (psychStr) { try { setPsychTags(JSON.parse(psychStr)) } catch { /* keep default */ } }
    if (gradesStr) { try { setGrades(JSON.parse(gradesStr)) } catch { /* keep default */ } }
    if (planStr) { try { setPlan(JSON.parse(planStr)) } catch { /* keep default */ } }
    if (commStr) setCommission(parseFloat(commStr) || 0)
    if (viewStr === 'list' || viewStr === 'compact' || viewStr === 'calendar') setViewMode(viewStr)
    setLoading(false)
  }, [activeId])

  useEffect(() => { loadAll() }, [loadAll])

  const filtered = useMemo(() => {
    const q = tickerQuery.trim().toUpperCase()
    return trades.filter((t) => {
      const res = deriveResult(t)
      if (resultFilter !== 'all' && res !== resultFilter) return false
      if (q && !(t.symbol || '').toUpperCase().includes(q)) return false
      if (directionFilter !== 'all' && t.direction !== directionFilter) return false
      if (setupFilter === 'none' && t.setup_tag !== null) return false
      if (setupFilter !== 'all' && setupFilter !== 'none' && t.setup_tag !== setupFilter) return false
      if (psychFilter === 'none' && t.psych_tag !== null) return false
      if (psychFilter !== 'all' && psychFilter !== 'none' && t.psych_tag !== psychFilter) return false
      if (gradeFilter === 'none' && t.grade !== null) return false
      if (gradeFilter !== 'all' && gradeFilter !== 'none' && t.grade !== gradeFilter) return false
      return true
    })
  }, [trades, resultFilter, tickerQuery, directionFilter, setupFilter, psychFilter, gradeFilter])

  const visibleTrades = filtered.slice(0, visibleCount)
  const hasMore = filtered.length > visibleCount

  const filtersActive =
    resultFilter !== 'all' || tickerQuery.trim() !== '' || directionFilter !== 'all' ||
    setupFilter !== 'all' || psychFilter !== 'all' || gradeFilter !== 'all'

  const stats = useMemo(() => calcStats(filtered), [filtered])

  const handleFilterChange = (next: () => void) => { next(); setVisibleCount(10) }

  const [editingId, setEditingId] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'compact' | 'calendar'>('list')
  const compact = viewMode === 'compact'

  function changeView(next: 'list' | 'compact' | 'calendar') {
    setViewMode(next)
    window.api.settings.set('journalView', next)
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-500">Loading…</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <span className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Journal</span>
        <div className="flex items-center gap-1 bg-dark-elevated border border-slate-700 rounded-lg p-1">
          {(['list', 'compact', 'calendar'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => changeView(mode)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-colors ${
                viewMode === mode ? 'bg-dark-surface text-white' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {trades.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <p className="text-base mb-2">No trades saved yet.</p>
          <p className="text-sm">Log a trade from the <strong className="text-slate-400">Trades</strong> or <strong className="text-slate-400">Calculator</strong> tab.</p>
        </div>
      ) : (
        <>
          {/* Filter bar */}
          <div className="flex flex-wrap gap-2 mb-4">
            <select
              value={resultFilter}
              onChange={(e) => handleFilterChange(() => setResultFilter(e.target.value as ResultFilter))}
              className="bg-dark-bg border border-slate-700 rounded-lg px-2.5 py-2 text-white text-xs outline-none focus:border-slate-500 transition-colors cursor-pointer"
            >
              <option value="all">All results</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
              <option value="open">Open</option>
            </select>

            <select
              value={directionFilter}
              onChange={(e) => handleFilterChange(() => setDirectionFilter(e.target.value as DirectionFilter))}
              className="bg-dark-bg border border-slate-700 rounded-lg px-2.5 py-2 text-white text-xs outline-none focus:border-slate-500 transition-colors cursor-pointer"
            >
              <option value="all">Long &amp; Short</option>
              <option value="long">Long only</option>
              <option value="short">Short only</option>
            </select>

            <select
              value={setupFilter}
              onChange={(e) => handleFilterChange(() => setSetupFilter(e.target.value))}
              className="bg-dark-bg border border-slate-700 rounded-lg px-2.5 py-2 text-white text-xs outline-none focus:border-slate-500 transition-colors cursor-pointer"
            >
              <option value="all">All setups</option>
              {setupTags.map((tag) => <option key={tag.id} value={tag.id}>{tag.label}</option>)}
              <option value="none">— No setup tagged</option>
            </select>

            <select
              value={psychFilter}
              onChange={(e) => handleFilterChange(() => setPsychFilter(e.target.value))}
              className="bg-dark-bg border border-slate-700 rounded-lg px-2.5 py-2 text-white text-xs outline-none focus:border-slate-500 transition-colors cursor-pointer"
            >
              <option value="all">All psych</option>
              {psychTags.map((tag) => <option key={tag.id} value={tag.id}>{tag.label}</option>)}
              <option value="none">— No psych tagged</option>
            </select>

            <select
              value={gradeFilter}
              onChange={(e) => handleFilterChange(() => setGradeFilter(e.target.value))}
              className="bg-dark-bg border border-slate-700 rounded-lg px-2.5 py-2 text-white text-xs outline-none focus:border-slate-500 transition-colors cursor-pointer"
            >
              <option value="all">All grades</option>
              {grades.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
              <option value="none">— Ungraded</option>
            </select>

            <input
              type="text"
              value={tickerQuery}
              onChange={(e) => handleFilterChange(() => setTickerQuery(e.target.value))}
              placeholder="Search ticker…"
              className="flex-1 min-w-[140px] bg-dark-bg border border-slate-700 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-slate-500 transition-colors placeholder:text-slate-500"
            />

            {filtersActive && (
              <>
                <button
                  onClick={() => {
                    setResultFilter('all'); setTickerQuery(''); setDirectionFilter('all')
                    setSetupFilter('all'); setPsychFilter('all'); setGradeFilter('all'); setVisibleCount(10)
                  }}
                  className="px-3 py-2 rounded-lg border border-slate-800 text-slate-400 text-xs font-medium hover:text-white hover:border-slate-600 transition-colors"
                >
                  Clear
                </button>
                <span className="flex items-center text-xs text-slate-500 px-2">
                  {filtered.length} of {trades.length}
                </span>
              </>
            )}
          </div>

          {viewMode === 'calendar' ? (
            <CalendarView trades={filtered} />
          ) : (
            <>
              {/* Summary stats */}
              <div className="mb-6">
                {filtersActive && (
                  <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Stats for filtered trades</p>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <SummaryCell
                    label="P&L"
                    value={stats.closedCount > 0 ? `${stats.pnl >= 0 ? '+' : ''}$${Math.abs(stats.pnl).toFixed(2)}` : '—'}
                    color={stats.closedCount === 0 ? 'text-slate-400' : stats.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}
                  />
                  <SummaryCell
                    label="Win Rate"
                    value={stats.winRate !== null ? `${(stats.winRate * 100).toFixed(1)}%` : '—'}
                    color={stats.winRate === null ? 'text-slate-400' : stats.winRate >= 0.5 ? 'text-emerald-400' : 'text-red-400'}
                  />
                  <SummaryCell
                    label="Avg R:R"
                    value={stats.avgRR !== null ? `1:${stats.avgRR.toFixed(2)}` : '—'}
                    color="text-white"
                  />
                  <SummaryCell
                    label="Max Drawdown"
                    value={stats.maxDD > 0 ? `-$${stats.maxDD.toFixed(2)}` : '—'}
                    color={stats.maxDD > 0 ? 'text-red-400' : 'text-slate-400'}
                  />
                </div>
              </div>

              {/* Trade list */}
              {visibleTrades.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">No trades match the current filter.</div>
              ) : (
                <div className="space-y-3 mb-4">
                  {visibleTrades.map((trade) => (
                    <JournalTradeCard
                      key={trade.id}
                      trade={trade}
                      setupTags={setupTags}
                      psychTags={psychTags}
                      grades={grades}
                      plan={plan}
                      commission={commission}
                      compact={compact}
                      onReload={loadAll}
                      editingId={editingId}
                      setEditingId={setEditingId}
                    />
                  ))}
                </div>
              )}

              {hasMore && (
                <button
                  onClick={() => setVisibleCount((n) => n + 10)}
                  className="w-full py-2.5 mb-4 rounded-lg border border-slate-700 text-slate-400 text-sm font-medium hover:text-white hover:border-slate-500 transition-colors"
                >
                  Show more ({filtered.length - visibleCount} remaining)
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
