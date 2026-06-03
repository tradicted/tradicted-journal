import { useState, useEffect, useCallback } from 'react'
import { ResultCell } from '../components/ResultCell'
import { usd, usd2 } from '../utils'
import { today } from '../utils'
import { usePortfolio } from '../context/PortfolioContext'

const inputClass =
  'w-full bg-dark-bg border border-slate-700 rounded-lg px-4 py-3 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-[#5c49ac]/50 focus:border-[#5c49ac]/40 outline-none transition-colors text-sm'
const labelClass = 'block text-sm font-medium text-slate-300 mb-1.5'
const helperClass = 'text-xs text-slate-500 mt-1'

export default function Calculator() {
  const { activeId } = usePortfolio()
  const [account, setAccount] = useState(10000)
  const [entry, setEntry] = useState<number | ''>('')
  const [stopLoss, setStopLoss] = useState<number | ''>('')
  const [takeProfit, setTakeProfit] = useState<number | ''>('')
  const [riskPct, setRiskPct] = useState(1)
  const [positionOverride, setPositionOverride] = useState<number | ''>('')
  const [ticker, setTicker] = useState('')
  const [fractional, setFractional] = useState(false)
  const [saveFlash, setSaveFlash] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    Promise.all([
      window.api.settings.get('accountSize'),
      window.api.settings.get('riskPct')
    ]).then(([acct, risk]) => {
      if (acct) setAccount(parseFloat(acct))
      if (risk) setRiskPct(parseFloat(risk))
    })
  }, [])

  const entryNum = typeof entry === 'number' ? entry : 0
  const stopNum = typeof stopLoss === 'number' ? stopLoss : 0
  const tpNum = typeof takeProfit === 'number' ? takeProfit : 0

  const riskPerShare = entryNum > 0 && stopNum > 0 ? Math.abs(entryNum - stopNum) : 0
  const rewardPerShare = entryNum > 0 && tpNum > 0 ? Math.abs(tpNum - entryNum) : 0
  const rrRatio = riskPerShare > 0 ? rewardPerShare / riskPerShare : 0
  const dollarRisk = account * (riskPct / 100)

  const rawShares = riskPerShare > 0 ? dollarRisk / riskPerShare : 0
  const autoShares = fractional
    ? parseFloat(Math.max(0.00001, rawShares).toFixed(5))
    : Math.max(1, Math.floor(rawShares))

  const shares =
    typeof positionOverride === 'number' && positionOverride > 0 ? positionOverride : autoShares

  const actualDollarRisk = shares * riskPerShare
  const actualDollarReward = shares * rewardPerShare
  const totalPositionValue = shares * entryNum
  const breakEvenWinRate = rrRatio > 0 ? 1 / (1 + rrRatio) : 0
  const hasValidInputs = entryNum > 0 && stopNum > 0 && tpNum > 0 && riskPerShare > 0

  const sharesDisplay = fractional
    ? autoShares.toFixed(5).replace(/\.?0+$/, '')
    : autoShares.toString()

  const handleSave = useCallback(async () => {
    if (!hasValidInputs) return
    setSaveError('')
    try {
      const direction = tpNum > entryNum ? 'long' : 'short'
      await window.api.trades.create({
        date: today(),
        symbol: ticker.trim().toUpperCase() || 'N/A',
        direction,
        entry_price: entryNum,
        exit_price: null,
        stop_loss: stopNum,
        take_profit: tpNum,
        position_size: shares,
        pnl: null,
        r_multiple: rrRatio,
        status: 'open',
        notes: null,
        tags: null,
        screenshot_path: null,
        portfolio_id: activeId,
        setup_tag: null,
        psych_tag: null,
        grade: null,
        rules_followed: null,
      })
      setSaveFlash(true)
      setTimeout(() => setSaveFlash(false), 1500)
    } catch {
      setSaveError('Failed to save trade.')
    }
  }, [hasValidInputs, ticker, entryNum, stopNum, tpNum, shares, rrRatio, activeId])

  const handleShare = useCallback(() => {
    if (!hasValidInputs) return
    const t = ticker.trim().toUpperCase()
    const lines = [
      `1:${rrRatio.toFixed(2)} R:R trade${t ? ` on $${t}` : ''} 📊`,
      `Entry: $${entryNum}`,
      `SL: $${stopNum}`,
      `TP: $${tpNum}`,
      '',
      'tradicted.com/trading-journal/'
    ]
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(lines.join('\n'))}`,
      '_blank'
    )
  }, [hasValidInputs, ticker, rrRatio, entryNum, stopNum, tpNum])

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-white mb-6">Risk-Reward Calculator</h1>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Inputs */}
        <div className="lg:col-span-3 bg-dark-surface border border-slate-800 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-6">Trade Setup</h2>

          {/* Ticker + Fractional */}
          <div className="mb-4">
            <label className={labelClass}>
              Ticker <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                className={`${inputClass} flex-1`}
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                onFocus={(e) => e.target.select()}
                placeholder="e.g. AAPL, BTC, EUR/USD"
              />
              <button
                onClick={() => setFractional((f) => !f)}
                className={`px-3 py-3 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap flex-shrink-0 ${
                  fractional
                    ? 'bg-[#1e99dc]/15 border-[#1e99dc] text-[#1e99dc]'
                    : 'bg-transparent border-slate-700 text-slate-500 hover:text-slate-300'
                }`}
              >
                Fractional
              </button>
            </div>
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

          {/* Position override */}
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
        </div>

        {/* Results */}
        <div className="lg:col-span-2 bg-dark-elevated border border-slate-700 rounded-2xl p-6 flex flex-col">
          <h2 className="text-lg font-bold text-white mb-6">Results</h2>

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
                <ResultCell label="Dollar Risk" value={usd2.format(actualDollarRisk)} color="text-red-400" />
                <ResultCell label="Dollar Reward" value={usd2.format(actualDollarReward)} color="text-emerald-400" />
                <ResultCell
                  label="Position Size"
                  value={`${fractional ? parseFloat(shares.toFixed(5)).toString() : shares} units`}
                  color="text-slate-200"
                />
                <ResultCell label="Position Value" value={usd.format(totalPositionValue)} color="text-slate-200" />
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

              {saveError && (
                <p className="text-xs text-red-400 text-center mt-2">{saveError}</p>
              )}

              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleSave}
                  className="flex-1 py-2.5 rounded-xl bg-[#5c49ac] text-white text-sm font-semibold hover:bg-[#4c3a9c] transition-colors"
                >
                  {saveFlash ? 'Logged ✓' : 'Log Trade'}
                </button>
                <button
                  onClick={handleShare}
                  title="Share on X"
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 text-sm font-semibold hover:text-white hover:border-slate-500 transition-colors flex items-center gap-1.5"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63 5.905-5.63Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  Share
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-grow flex items-center justify-center">
              <p className="text-slate-500 text-sm text-center">
                Enter your entry, stop loss and take profit prices to see results.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
