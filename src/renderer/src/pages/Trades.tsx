import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Trade } from '../types'
import { usd2, calcPnlFromTrade, calcRMultipleFromTrade } from '../utils'
import { usePortfolio } from '../context/PortfolioContext'

/* ── helpers ── */
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

const inputCls =
  'w-full bg-dark-bg border border-slate-700 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-slate-500 transition-colors'

/* ════════════════════════════════════════════════════════════
   TradeCard
   ════════════════════════════════════════════════════════════ */

interface CardProps {
  trade: Trade
  onReload: () => void
  editingId: number | null
  setEditingId: (id: number | null) => void
}

function TradeCard({ trade: t, onReload, editingId, setEditingId }: CardProps) {
  const editing = editingId === t.id
  const editingIdRef = useRef(editingId)
  editingIdRef.current = editingId
  const cardRef = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  /* close menu on outside click */
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  /* click-outside closes edit mode — skip if another card already claimed editingId */
  useEffect(() => {
    if (!editing) return
    const handler = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        if (editingIdRef.current !== t.id) return
        setEditingId(null)
      }
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [editing, setEditingId, t.id])

  /* planned R:R from prices */
  const riskPs   = t.entry_price > 0 && t.stop_loss   ? Math.abs(t.entry_price - t.stop_loss)   : 0
  const rewardPs = t.entry_price > 0 && t.take_profit ? Math.abs(t.take_profit - t.entry_price) : 0
  const plannedRR = riskPs > 0 ? rewardPs / riskPs : (t.r_multiple ?? 0)
  const dollarRisk   = riskPs   * t.position_size
  const dollarReward = rewardPs * t.position_size
  const breakEven    = plannedRR > 0 ? 1 / (1 + plannedRR) : 0

  const rrColor = plannedRR >= 2 ? '#4ade80' : plannedRR >= 1 ? '#fbbf24' : '#f87171'
  const result  = deriveResult(t)
  const isLong  = t.direction === 'long'

  /* ── edit state ── */
  type EditState = {
    ticker: string; entry: string; stop: string; tp: string
    actualExit: string; shares: string; notes: string
  }
  const buildEdit = (): EditState => ({
    ticker: t.symbol === 'N/A' ? '' : t.symbol,
    entry:  String(t.entry_price),
    stop:   t.stop_loss   != null ? String(t.stop_loss)   : '',
    tp:     t.take_profit != null ? String(t.take_profit) : '',
    actualExit: t.exit_price != null ? String(t.exit_price) : '',
    shares: String(t.position_size),
    notes:  t.notes ?? '',
  })
  const [edit, setEdit] = useState<EditState>(buildEdit)

  /* live recalc in edit mode */
  const eNum    = parseFloat(edit.entry)  || 0
  const sNum    = parseFloat(edit.stop)   || 0
  const tNum    = parseFloat(edit.tp)     || 0
  const exitNum = edit.actualExit.trim() === '' ? null : parseFloat(edit.actualExit)
  const exitValid = exitNum !== null && !isNaN(exitNum) && exitNum > 0
  const sharesNum = parseFloat(edit.shares) || 0

  const liveRps  = eNum > 0 && sNum > 0 ? Math.abs(eNum - sNum) : 0
  const liveRwps = eNum > 0 && tNum > 0 ? Math.abs(tNum - eNum) : 0
  const liveRR   = liveRps > 0 ? liveRwps / liveRps : 0
  const liveRisk = sharesNum * liveRps
  const liveReward = sharesNum * liveRwps
  const liveBE   = liveRR > 0 ? 1 / (1 + liveRR) : 0
  const editValid = eNum > 0 && sNum > 0 && tNum > 0 && sharesNum > 0 && liveRps > 0

  /* realized preview in edit */
  const liveIsLong  = tNum > eNum
  const liveRealPs  = exitValid ? Math.abs(exitNum! - eNum) : 0
  const liveRealRR  = exitValid && liveRps > 0 ? liveRealPs / liveRps : 0
  const liveRealPnl = exitValid
    ? (liveIsLong ? exitNum! - eNum : eNum - exitNum!) * sharesNum
    : 0
  const exitIsWin = exitValid ? (liveIsLong ? exitNum! > eNum : exitNum! < eNum) : null

  async function handleSaveEdit() {
    if (!editValid) return
    const exitToSave = exitValid ? exitNum : null
    const direction = tNum > eNum ? 'long' : 'short'
    const pnlCalc = exitToSave !== null
      ? calcPnlFromTrade({ entry_price: eNum, exit_price: exitToSave, position_size: sharesNum, direction })
      : null
    const rCalc = exitToSave !== null
      ? calcRMultipleFromTrade({ entry_price: eNum, exit_price: exitToSave, stop_loss: sNum, position_size: sharesNum, direction })
      : liveRR

    await window.api.trades.update(t.id, {
      symbol: edit.ticker.trim().toUpperCase() || 'N/A',
      entry_price: eNum,
      stop_loss: sNum || null,
      take_profit: tNum || null,
      exit_price: exitToSave,
      position_size: sharesNum,
      direction,
      status: exitToSave !== null ? 'closed' : t.status,
      pnl: pnlCalc,
      r_multiple: rCalc,
      notes: edit.notes.trim() || null,
    })
    setEditingId(null)
    onReload()
  }

  function handleCancelEdit() {
    setEditingId(null)
    setEdit(buildEdit())
  }

  async function handleDelete() {
    setMenuOpen(false)
    if (!confirm('Delete this trade? This cannot be undone.')) return
    await window.api.trades.delete(t.id)
    onReload()
  }

  async function handleResult(r: 'won' | 'lost' | 'open') {
    if (r === 'open') {
      await window.api.trades.update(t.id, { status: 'open', exit_price: null, pnl: null, r_multiple: t.r_multiple })
    } else {
      const autoExit = r === 'won' ? t.take_profit : t.stop_loss
      const exitToUse = t.exit_price !== null ? t.exit_price : autoExit
      await window.api.trades.update(t.id, { status: 'closed', exit_price: exitToUse })
    }
    onReload()
  }

  return (
    <div
      ref={cardRef}
      className={`relative bg-dark-surface border border-slate-800 rounded-2xl p-5 transition-colors ${editing ? 'border-slate-600' : 'hover:border-slate-600 cursor-pointer'}`}
      onMouseDown={() => {
        if (editing) return
        setEdit(buildEdit())
        setEditingId(t.id)
      }}
    >

      {editing ? (
        /* ── edit mode ── */
        <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Edit Trade</p>

          <div className="grid grid-cols-3 gap-2 mb-2">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Ticker</label>
              <input className={inputCls} value={edit.ticker} onChange={(e) => setEdit((s) => ({ ...s, ticker: e.target.value.toUpperCase() }))} placeholder="AAPL" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Entry</label>
              <input className={inputCls} type="number" step="any" value={edit.entry} onChange={(e) => setEdit((s) => ({ ...s, entry: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Stop Loss</label>
              <input className={inputCls} type="number" step="any" value={edit.stop} onChange={(e) => setEdit((s) => ({ ...s, stop: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-2">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Take Profit</label>
              <input className={inputCls} type="number" step="any" value={edit.tp} onChange={(e) => setEdit((s) => ({ ...s, tp: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Actual Exit <span className="text-slate-600">(optional)</span></label>
              <input className={inputCls} type="number" step="any" value={edit.actualExit} onChange={(e) => setEdit((s) => ({ ...s, actualExit: e.target.value }))} placeholder="If different from TP" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Units / Shares</label>
              <input className={inputCls} type="number" step="any" value={edit.shares} onChange={(e) => setEdit((s) => ({ ...s, shares: e.target.value }))} />
            </div>
          </div>

          <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
            Set Actual Exit if you closed at a different price than TP. Analytics uses this for realized R.
          </p>

          <div className="mb-3">
            <label className="block text-xs text-slate-500 mb-1">Notes</label>
            <textarea className={`${inputCls} resize-none`} rows={2} value={edit.notes} onChange={(e) => setEdit((s) => ({ ...s, notes: e.target.value }))} placeholder="Entry reason, observations..." />
          </div>

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
                  <span className="text-slate-500">({liveIsLong ? 'long' : 'short'} — {exitIsWin ? 'profit' : 'loss'})</span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={handleSaveEdit} disabled={!editValid} className="flex-1 py-2 rounded-lg bg-[#5c49ac] text-white text-xs font-semibold hover:bg-[#4c3a9c] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Save</button>
            <button onClick={handleCancelEdit} className="flex-1 py-2 rounded-lg border border-slate-700 text-slate-400 text-xs font-semibold hover:text-white transition-colors">Cancel</button>
          </div>
        </div>
      ) : (
        /* ── view mode ── */
        <div>
          {/* Header */}
          <div className="flex items-center justify-between mb-3 gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg font-bold" style={{ color: rrColor }}>
                1 : {plannedRR.toFixed(2)}
              </span>
              {t.symbol && t.symbol !== 'N/A' && (
                <span className="text-sm font-bold text-[#1e99dc]">${t.symbol}</span>
              )}
              <span className={`px-1.5 py-0.5 inline-flex items-center gap-0.5 rounded border text-[10px] font-bold uppercase tracking-wide ${
                isLong
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-400'
              }`}>
                <span aria-hidden="true">{isLong ? '↑' : '↓'}</span>
                {isLong ? 'Long' : 'Short'}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-slate-500">{fmtDate(t)}</span>
              <div ref={menuRef} className="relative" onMouseDown={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                    <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
                  </svg>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-8 z-30 min-w-[130px] bg-dark-elevated border border-slate-700 rounded-xl shadow-xl overflow-hidden">
                    <button
                      onClick={() => { setMenuOpen(false); setEdit(buildEdit()); setEditingId(t.id) }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-slate-300 hover:bg-slate-700/50 hover:text-white transition-colors text-left"
                    >
                      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-none stroke-current stroke-2 flex-shrink-0" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      Edit
                    </button>
                    <button
                      onClick={handleDelete}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors text-left border-t border-slate-700/60"
                    >
                      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-none stroke-current stroke-2 flex-shrink-0" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Prices */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm mb-2 text-slate-400">
            <span>Entry: ${t.entry_price.toFixed(2)}</span>
            {t.stop_loss   != null && <span>SL: ${t.stop_loss.toFixed(2)}</span>}
            {t.take_profit != null && <span>TP: ${t.take_profit.toFixed(2)}</span>}
            {t.exit_price  != null && <span className="text-slate-200">Exit: <strong>${t.exit_price.toFixed(2)}</strong></span>}
          </div>

          {/* Dollar stats */}
          {riskPs > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm mb-2">
              <span className="text-red-400">Risk: ${dollarRisk.toFixed(2)}</span>
              <span className="text-emerald-400">Reward: ${dollarReward.toFixed(2)}</span>
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
                P&L {t.pnl >= 0 ? '+' : ''}{usd2.format(t.pnl)}
              </span>
            </div>
          )}

          {/* Notes */}
          {t.notes && (
            <p className="text-xs text-slate-500 italic mb-3 leading-relaxed">{t.notes}</p>
          )}

          {/* Result toggle */}
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
            {(['won', 'lost', 'open'] as const).map((r) => (
              <button
                key={r}
                onClick={() => handleResult(r)}
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
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   Trades page
   ════════════════════════════════════════════════════════════ */

export default function Trades() {
  const navigate = useNavigate()
  const { activeId } = usePortfolio()
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [filterSymbol, setFilterSymbol] = useState('')
  const [filterResult, setFilterResult] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)

  const loadTrades = useCallback(async () => {
    const data = await window.api.trades.getAll(activeId)
    setTrades(data)
    setLoading(false)
  }, [activeId])

  useEffect(() => { loadTrades() }, [loadTrades])

  const filtered = trades.filter((t) => {
    if (filterSymbol && !t.symbol.includes(filterSymbol.toUpperCase())) return false
    if (filterResult) {
      const r = deriveResult(t)
      if (r !== filterResult) return false
    }
    return true
  })

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-slate-500">Loading…</div>
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-white">Trades</h1>
        <button
          onClick={() => navigate('/new-trade')}
          className="px-4 py-2 rounded-xl bg-[#5c49ac] text-white text-sm font-semibold hover:bg-[#4c3a9c] transition-colors"
        >
          + New Trade
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5">
        <input
          type="text"
          placeholder="Filter by symbol…"
          value={filterSymbol}
          onChange={(e) => setFilterSymbol(e.target.value)}
          className="px-3 py-2 bg-dark-surface border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 outline-none focus:border-slate-500 w-48"
        />
        <select
          value={filterResult}
          onChange={(e) => setFilterResult(e.target.value)}
          className="px-3 py-2 bg-dark-surface border border-slate-700 rounded-lg text-sm text-white outline-none focus:border-slate-500"
        >
          <option value="">All results</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
          <option value="open">Open</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-dark-surface border border-slate-800 rounded-2xl p-12 text-center">
          <p className="text-slate-400 text-sm">No trades yet.</p>
          <button onClick={() => navigate('/new-trade')} className="mt-3 text-[#5c49ac] text-sm hover:underline">
            Log your first trade
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <TradeCard key={t.id} trade={t} onReload={loadTrades} editingId={editingId} setEditingId={setEditingId} />
          ))}
        </div>
      )}
    </div>
  )
}
