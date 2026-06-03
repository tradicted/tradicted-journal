import { useState } from 'react'
import type { Trade } from '../types'

function deriveResult(t: Trade): 'won' | 'lost' | 'open' {
  if (t.status !== 'closed') return 'open'
  if (t.pnl !== null) return t.pnl > 0 ? 'won' : 'lost'
  return 'open'
}

export function CalendarView({ trades }: { trades: Trade[] }) {
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })

  const byDay: Record<string, Trade[]> = {}
  trades.forEach((t) => {
    const src = t.date || t.created_at
    const d = new Date(src)
    if (isNaN(d.getTime())) return
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!byDay[key]) byDay[key] = []
    byDay[key].push(t)
  })

  const firstDay = new Date(month.year, month.month, 1).getDay()
  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate()
  const today = new Date()
  const isCurrentMonth = today.getFullYear() === month.year && today.getMonth() === month.month

  const monthName = new Date(month.year, month.month, 1).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric',
  })

  const prevMonth = () =>
    setMonth((m) => (m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 }))
  const nextMonth = () =>
    setMonth((m) => (m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 }))

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  return (
    <div>
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          className="p-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-white">{monthName}</span>
        <button
          onClick={nextMonth}
          className="p-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
          <div key={d} className="text-center text-xs text-slate-600 font-medium py-1">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} />
          const key = `${month.year}-${String(month.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayTrades = byDay[key] || []
          const won = dayTrades.filter((t) => deriveResult(t) === 'won')
          const lost = dayTrades.filter((t) => deriveResult(t) === 'lost')
          const closed = won.length + lost.length
          const pnl = dayTrades.reduce((s, t) => s + (t.pnl ?? 0), 0)
          const isToday = isCurrentMonth && day === today.getDate()

          const bgColor =
            dayTrades.length === 0
              ? ''
              : closed === 0
              ? 'bg-slate-800/50'
              : pnl > 0
              ? 'bg-emerald-900/30 border-emerald-800/50'
              : 'bg-red-900/30 border-red-800/50'

          return (
            <div
              key={key}
              className={`min-h-[64px] rounded-lg border p-1.5 ${
                isToday ? 'border-slate-500' : 'border-slate-800'
              } ${bgColor} transition-colors`}
            >
              <p className={`text-xs font-semibold mb-1 ${isToday ? 'text-white' : 'text-slate-500'}`}>{day}</p>
              {dayTrades.length > 0 && (
                <div className="space-y-0.5">
                  <p className={`text-xs font-bold ${closed === 0 ? 'text-slate-400' : pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {closed > 0 ? `${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toFixed(0)}` : '—'}
                  </p>
                  <p className="text-[10px] text-slate-500">{dayTrades.length} trade{dayTrades.length !== 1 ? 's' : ''}</p>
                  {closed > 0 && (
                    <p className="text-[10px] text-slate-500">{won.length}W/{lost.length}L</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
