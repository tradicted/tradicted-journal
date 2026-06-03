import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { PlanRule } from '../types'
import { today, usd, usd2 } from '../utils'
import { usePortfolio } from '../context/PortfolioContext'
import { ResultCell } from '../components/ResultCell'
import { RuleChecklist } from '../components/RuleChecklist'

const inputClass =
  'w-full bg-dark-bg border border-slate-700 rounded-lg px-4 py-3 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-[#5c49ac]/50 focus:border-[#5c49ac]/40 outline-none transition-colors text-sm'
const labelClass = 'block text-sm font-medium text-slate-300 mb-1.5'
const helperClass = 'text-xs text-slate-500 mt-1'

export default function NewTrade() {
  const navigate = useNavigate()
  const { activeId } = usePortfolio()

  const [account, setAccount] = useState(10000)
  const [riskPct, setRiskPct] = useState(1)
  const [ticker, setTicker] = useState('')
  const [entry, setEntry] = useState<number | ''>('')
  const [stopLoss, setStopLoss] = useState<number | ''>('')
  const [takeProfit, setTakeProfit] = useState<number | ''>('')
  const [positionOverride, setPositionOverride] = useState<number | ''>('')
  const [notes, setNotes] = useState('')
  const [plan, setPlan] = useState<PlanRule[]>([])
  const [checkedRules, setCheckedRules] = useState<string[]>([])
  const [extraOpen, setExtraOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveFlash, setSaveFlash] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      window.api.settings.get('accountSize'),
      window.api.settings.get('riskPct'),
      window.api.settings.get(`trading_plan_${activeId}`)
    ]).then(([acct, risk, planRaw]) => {
      if (acct) setAccount(parseFloat(acct))
      if (risk) setRiskPct(parseFloat(risk))
      if (planRaw) {
        try { setPlan(JSON.parse(planRaw)) } catch { setPlan([]) }
      } else {
        setPlan([])
      }
      setCheckedRules([])
    })
  }, [activeId])

  const entryNum = typeof entry === 'number' ? entry : 0
  const stopNum = typeof stopLoss === 'number' ? stopLoss : 0
  const tpNum = typeof takeProfit === 'number' ? takeProfit : 0

  const direction = tpNum > 0 && entryNum > 0 ? (tpNum > entryNum ? 'long' : 'short') : 'long'

  const riskPerShare = entryNum > 0 && stopNum > 0 ? Math.abs(entryNum - stopNum) : 0
  const rewardPerShare = entryNum > 0 && tpNum > 0 ? Math.abs(tpNum - entryNum) : 0
  const rrRatio = riskPerShare > 0 ? rewardPerShare / riskPerShare : 0
  const dollarRisk = account * (riskPct / 100)

  const rawShares = riskPerShare > 0 ? dollarRisk / riskPerShare : 0
  const autoShares = Math.max(1, Math.floor(rawShares))
  const shares = typeof positionOverride === 'number' && positionOverride > 0 ? positionOverride : autoShares

  const actualDollarRisk = shares * riskPerShare
  const actualDollarReward = shares * rewardPerShare
  const totalPositionValue = shares * entryNum
  const breakEvenWinRate = rrRatio > 0 ? 1 / (1 + rrRatio) : 0
  const hasValidInputs = entryNum > 0 && stopNum > 0 && tpNum > 0

  const sharesDisplay = autoShares.toString()
  const isValid = entryNum > 0 && shares > 0

  const handleSave = useCallback(async () => {
    if (!isValid) return
    setSaving(true)
    setError('')
    try {
      await window.api.trades.create({
        date: today(),
        symbol: ticker.trim().toUpperCase() || 'N/A',
        direction,
        entry_price: entryNum,
        exit_price: null,
        stop_loss: stopNum || null,
        take_profit: tpNum || null,
        position_size: shares,
        pnl: null,
        r_multiple: rrRatio > 0 ? rrRatio : null,
        status: 'open',
        notes: notes.trim() || null,
        tags: null,
        screenshot_path: null,
        portfolio_id: activeId,
        setup_tag: null,
        psych_tag: null,
        grade: null,
        rules_followed: null,
      })
      setSaveFlash(true)
      setTimeout(() => {
        setSaveFlash(false)
        navigate('/trades')
      }, 1000)
    } catch {
      setError('Failed to save trade. Please try again.')
    } finally {
      setSaving(false)
    }
  }, [isValid, ticker, direction, entryNum, stopNum, tpNum, shares, rrRatio, notes, activeId, navigate])

  const actionButtons = (
    <div className="flex gap-2 mt-4">
      <button
        type="button"
        onClick={handleSave}
        disabled={!isValid || saving}
        className="flex-1 py-2.5 rounded-xl bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saveFlash ? 'Logged ✓' : saving ? 'Saving…' : 'Log Trade'}
      </button>
      <button
        type="button"
        onClick={() => navigate('/trades')}
        className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 text-sm font-semibold hover:text-white hover:border-slate-500 transition-colors"
      >
        Cancel
      </button>
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto">
      <div className="grid lg:grid-cols-5 gap-6">

        {/* ── Inputs Card ── */}
        <div className="lg:col-span-3 bg-dark-surface border border-slate-800 rounded-2xl p-6">
          {/* Ticker */}
          <div className="mb-4">
            <label className={labelClass}>
              Ticker <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              className={inputClass}
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              onFocus={(e) => e.target.select()}
              placeholder="e.g. AAPL, BTC, EUR/USD"
            />
          </div>

          {/* Entry / SL / TP */}
          <div className="grid sm:grid-cols-3 gap-4 mb-6">
            <div>
              <label className={labelClass}>Entry Price</label>
              <input
                type="number"
                className={inputClass}
                value={entry === '' ? '' : entry}
                onChange={(e) => setEntry(e.target.value === '' ? '' : parseFloat(e.target.value))}
                onFocus={(e) => e.target.select()}
                placeholder="e.g. 50.00"
                step="any"
              />
            </div>
            <div>
              <label className={labelClass}>Stop Loss</label>
              <input
                type="number"
                className={inputClass}
                value={stopLoss === '' ? '' : stopLoss}
                onChange={(e) => setStopLoss(e.target.value === '' ? '' : parseFloat(e.target.value))}
                onFocus={(e) => e.target.select()}
                placeholder="e.g. 48.00"
                step="any"
              />
            </div>
            <div>
              <label className={labelClass}>Take Profit</label>
              <input
                type="number"
                className={inputClass}
                value={takeProfit === '' ? '' : takeProfit}
                onChange={(e) => setTakeProfit(e.target.value === '' ? '' : parseFloat(e.target.value))}
                onFocus={(e) => e.target.select()}
                placeholder="e.g. 56.00"
                step="any"
              />
            </div>
          </div>

          {/* Account + Risk slider */}
          <div className="grid sm:grid-cols-2 gap-4 mb-6">
            <div>
              <label className={labelClass}>Account Size</label>
              <input
                type="number"
                className={inputClass}
                value={account}
                onChange={(e) => setAccount(parseFloat(e.target.value) || 0)}
                onFocus={(e) => e.target.select()}
                placeholder="10000"
              />
            </div>
            <div>
              <label className={labelClass}>
                Risk Per Trade:{' '}
                <span className="text-white font-semibold">{riskPct}%</span>
              </label>
              <input
                type="range"
                min={0.1}
                max={5}
                step={0.1}
                value={riskPct}
                onChange={(e) => setRiskPct(parseFloat(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer mt-2
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5
                  [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer
                  [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5
                  [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white"
                style={{
                  background: `linear-gradient(to right, #5c49ac ${((riskPct - 0.1) / 4.9) * 100}%, #334155 ${((riskPct - 0.1) / 4.9) * 100}%)`
                }}
              />
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>0.1%</span>
                <span>5%</span>
              </div>
            </div>
          </div>

          {/* Position size */}
          <div>
            <label className={labelClass}>
              Position Size{' '}
              <span className="text-slate-500 font-normal">(auto-calculated, or override)</span>
            </label>
            <input
              type="number"
              className={inputClass}
              value={positionOverride === '' ? '' : positionOverride}
              onChange={(e) =>
                setPositionOverride(e.target.value === '' ? '' : parseInt(e.target.value, 10))
              }
              onFocus={(e) => e.target.select()}
              placeholder={autoShares > 0 ? `Auto: ${sharesDisplay} units` : 'Enter prices first'}
            />
            {positionOverride === '' && autoShares > 0 && (
              <p className={helperClass}>
                Auto: {sharesDisplay} units based on {riskPct}% risk ({usd.format(dollarRisk)})
              </p>
            )}
          </div>

          {/* Extra (Notes + Trading Plan) */}
          <div className="mt-5 border-t border-slate-800 pt-4">
            <button
              type="button"
              onClick={() => setExtraOpen((o) => !o)}
              className="w-full flex items-center justify-between text-left group"
            >
              <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">
                Extra
              </span>
              <svg
                viewBox="0 0 24 24"
                className={`w-3.5 h-3.5 fill-none stroke-current stroke-2 text-slate-500 transition-transform ${extraOpen ? 'rotate-180' : ''}`}
                strokeLinecap="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {extraOpen && (
              <div className="mt-4 space-y-5">
                <div>
                  <label className={labelClass}>Notes</label>
                  <textarea
                    className={`${inputClass} resize-none`}
                    rows={4}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Trade rationale, observations…"
                  />
                </div>

                {plan.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-slate-300 mb-3">Trading Plan</p>
                    <RuleChecklist
                      plan={plan}
                      checkedIds={checkedRules}
                      onChange={setCheckedRules}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Results Card ── */}
        <div className="lg:col-span-2 bg-dark-elevated border border-slate-700 rounded-2xl p-6 flex flex-col">
          {hasValidInputs ? (
            <div className="flex-grow flex flex-col justify-between">
              <div className="text-center mb-6">
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Risk : Reward</p>
                <p className="text-3xl font-bold text-white">1 : {rrRatio.toFixed(2)}</p>
                {ticker.trim() && (
                  <p className="text-sm text-[#1e99dc] font-semibold mt-1">
                    ${ticker.trim().toUpperCase()}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <ResultCell label="Dollar Risk"    value={usd2.format(actualDollarRisk)}   color="text-red-400" />
                <ResultCell label="Dollar Reward"  value={usd2.format(actualDollarReward)} color="text-emerald-400" />
                <ResultCell label="Position Size"  value={`${shares} units`}               color="text-slate-200" />
                <ResultCell label="Position Value" value={usd.format(totalPositionValue)}  color="text-slate-200" />
              </div>

              <div className="mt-4 p-4 rounded-xl bg-dark-surface border border-slate-800 text-center">
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Breakeven Win Rate</p>
                <p className="text-lg font-bold text-white">
                  {(breakEvenWinRate * 100).toFixed(1)}%
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Win rate needed to not lose money at 1:{rrRatio.toFixed(1)}
                </p>
              </div>

              {error && <p className="text-xs text-red-400 text-center mt-2">{error}</p>}
              {actionButtons}
            </div>
          ) : (
            <div className="flex-grow flex flex-col justify-between">
              <div className="flex-grow flex items-center justify-center">
                <p className="text-slate-500 text-sm text-center">
                  Enter your entry, stop loss and take profit prices to see results.
                </p>
              </div>
              {error && <p className="text-xs text-red-400 text-center mb-2">{error}</p>}
              {actionButtons}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
