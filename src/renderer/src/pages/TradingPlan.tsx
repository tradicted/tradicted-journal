import { useState, useEffect, useCallback } from 'react'
import type { PlanRule, PlanOption } from '../types'
import { RuleChecklist } from '../components/RuleChecklist'
import { usePortfolio } from '../context/PortfolioContext'

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('')

export default function TradingPlan() {
  const { activeId } = usePortfolio()
  const [plan, setPlan] = useState<PlanRule[]>([])
  const [editing, setEditing] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setLoaded(false)
    window.api.settings.get(`trading_plan_${activeId}`).then((raw) => {
      if (raw) {
        try {
          setPlan(JSON.parse(raw))
        } catch {
          setPlan([])
        }
      } else {
        setPlan([])
      }
      setEditing(false)
      setLoaded(true)
    })
  }, [activeId])

  const onPlanChange = useCallback((next: PlanRule[]) => {
    setPlan(next)
    window.api.settings.set(`trading_plan_${activeId}`, JSON.stringify(next))
  }, [activeId])

  const checkedIds = [
    ...plan.filter((r) => !r.hasOptions && r.checked).map((r) => r.id),
    ...plan.flatMap((r) => r.options.filter((o) => o.checked).map((o) => o.id)),
  ]

  const handleCheckedChange = (ids: string[]) => {
    onPlanChange(plan.map((r) => ({
      ...r,
      checked: !r.hasOptions ? ids.includes(r.id) : r.checked,
      options: r.options.map((o) => ({ ...o, checked: ids.includes(o.id) })),
    })))
  }

  const addRule = () => {
    const next: PlanRule = {
      id: makeId(),
      number: plan.length + 1,
      text: 'New rule',
      name: '',
      hasOptions: false,
      checked: false,
      options: [],
    }
    onPlanChange([...plan, next])
  }

  const updateRule = (id: string, patch: Partial<PlanRule>) => {
    onPlanChange(plan.map((r) => r.id === id ? { ...r, ...patch } : r))
  }

  const deleteRule = (id: string) => {
    const next = plan.filter((r) => r.id !== id)
    onPlanChange(next.map((r, i) => ({ ...r, number: i + 1 })))
  }

  const toggleHasOptions = (rule: PlanRule) => {
    updateRule(rule.id, {
      hasOptions: !rule.hasOptions,
      checked: false,
      options: rule.hasOptions ? [] : [
        { id: makeId(), letter: 'a', text: 'Option a', name: '', checked: false },
      ],
    })
  }

  const addOption = (ruleId: string) => {
    const rule = plan.find((r) => r.id === ruleId)
    if (!rule) return
    const letter = LETTERS[rule.options.length] ?? String(rule.options.length + 1)
    const newOpt: PlanOption = { id: makeId(), letter, text: 'New option', name: '', checked: false }
    updateRule(ruleId, { options: [...rule.options, newOpt] })
  }

  const updateOption = (ruleId: string, optId: string, patch: Partial<PlanOption>) => {
    onPlanChange(plan.map((r) =>
      r.id === ruleId
        ? { ...r, options: r.options.map((o) => o.id === optId ? { ...o, ...patch } : o) }
        : r
    ))
  }

  const deleteOption = (ruleId: string, optId: string) => {
    const rule = plan.find((r) => r.id === ruleId)
    if (!rule) return
    const opts = rule.options
      .filter((o) => o.id !== optId)
      .map((o, i) => ({ ...o, letter: LETTERS[i] ?? String(i + 1) }))
    updateRule(ruleId, { options: opts })
  }

  const inputCls = 'bg-dark-bg border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-slate-500 transition-colors'

  if (!loaded) return null

  if (plan.length === 0 && !editing) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="text-center py-16">
          <p className="text-slate-400 text-sm mb-1">No trading plan yet.</p>
          <p className="text-slate-600 text-xs mb-6">Build a rule-based checklist to follow before each trade.</p>
          <button
            onClick={() => setEditing(true)}
            className="px-4 py-2 rounded-lg bg-[#5c49ac] text-white text-xs font-semibold hover:bg-[#4c3a9c] transition-colors"
          >
            Create Plan
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-semibold text-white">Trading Plan</h2>
            {!editing && plan.length > 0 && (
              <p className="text-xs text-slate-500 mt-0.5">Check off rules before entering a trade.</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!editing && plan.length > 0 && (
              <button
                onClick={() =>
                  onPlanChange(plan.map((r) => ({
                    ...r,
                    checked: false,
                    options: r.options.map((o) => ({ ...o, checked: false })),
                  })))
                }
                className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200 text-xs font-semibold transition-colors"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => setEditing((e) => !e)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                editing
                  ? 'border-[#5c49ac] bg-[#5c49ac]/20 text-[#a497d8] hover:bg-[#5c49ac]/30'
                  : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
              }`}
            >
              {editing ? 'Done' : 'Edit Plan'}
            </button>
          </div>
        </div>

        {/* Rules */}
        {!editing ? (
          <RuleChecklist plan={plan} checkedIds={checkedIds} onChange={handleCheckedChange} />
        ) : (
          <div className="space-y-1">
            {plan.map((rule) => (
              <div key={rule.id}>
                <div className="flex items-start gap-3 py-2 group">
                  {!rule.hasOptions ? (
                    <EditCheckbox checked={rule.checked} />
                  ) : (() => {
                    const allChecked = rule.options.length > 0 && rule.options.every((o) => o.checked)
                    const someChecked = rule.options.some((o) => o.checked) && !allChecked
                    return <EditCheckbox checked={allChecked} indeterminate={someChecked} />
                  })()}

                  <span className="text-slate-500 text-xs font-mono w-5 flex-shrink-0 mt-0.5">{rule.number}.</span>

                  <div className="flex-1 flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        value={rule.text}
                        onChange={(e) => updateRule(rule.id, { text: e.target.value })}
                        className={`${inputCls} flex-1 min-w-0`}
                        placeholder="Rule description"
                      />
                      <input
                        value={rule.name}
                        onChange={(e) => updateRule(rule.id, { name: e.target.value })}
                        className={`${inputCls} w-28`}
                        placeholder="Short name"
                      />
                      <button
                        onClick={() => toggleHasOptions(rule)}
                        className={`px-2 py-1 rounded text-[10px] border transition-colors flex-shrink-0 ${
                          rule.hasOptions
                            ? 'border-[#5c49ac]/50 text-[#a497d8] bg-[#5c49ac]/10'
                            : 'border-slate-700 text-slate-500 hover:border-slate-500'
                        }`}
                        title={rule.hasOptions ? 'Remove sub-options' : 'Add sub-options (a, b, c…)'}
                      >
                        {rule.hasOptions ? 'Has options ✓' : '+ Options'}
                      </button>
                      <button
                        onClick={() => deleteRule(rule.id)}
                        className="text-slate-600 hover:text-red-400 transition-colors text-xs flex-shrink-0"
                        title="Delete rule"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>

                {(rule.hasOptions || rule.options.length > 0) && (
                  <div className="ml-12 space-y-0.5">
                    {rule.options.map((opt) => (
                      <div key={opt.id} className="flex items-start gap-3 py-1.5">
                        <EditCheckbox checked={opt.checked} />
                        <span className="text-slate-500 text-xs font-mono w-5 flex-shrink-0 mt-0.5">{opt.letter}.</span>
                        <div className="flex-1 flex items-center gap-2 flex-wrap">
                          <input
                            value={opt.text}
                            onChange={(e) => updateOption(rule.id, opt.id, { text: e.target.value })}
                            className={`${inputCls} flex-1 min-w-0`}
                            placeholder="Option description"
                          />
                          <input
                            value={opt.name}
                            onChange={(e) => updateOption(rule.id, opt.id, { name: e.target.value })}
                            className={`${inputCls} w-28`}
                            placeholder="Short name"
                          />
                          <button
                            onClick={() => deleteOption(rule.id, opt.id)}
                            className="text-slate-600 hover:text-red-400 transition-colors text-xs flex-shrink-0"
                            title="Delete option"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                    {rule.hasOptions && (
                      <button
                        onClick={() => addOption(rule.id)}
                        className="mt-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1 py-1"
                      >
                        <span className="text-base leading-none">+</span> Add option
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {editing && (
          <button
            onClick={addRule}
            className="mt-6 flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300 text-xs transition-colors"
          >
            <span className="text-base leading-none">+</span>
            Add rule
          </button>
        )}
      </div>
    </div>
  )
}

function EditCheckbox({ checked, indeterminate }: { checked: boolean; indeterminate?: boolean }) {
  const active = checked || !!indeterminate
  return (
    <span
      className={`w-4 h-4 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center ${
        active ? 'border-[#5c49ac]/40 bg-[#5c49ac]/30' : 'border-slate-800 bg-transparent'
      }`}
      aria-hidden="true"
    >
      {checked && (
        <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-[#a497d8] fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="2 6 5 9 10 3" />
        </svg>
      )}
      {indeterminate && !checked && (
        <span className="w-2 h-px bg-[#a497d8]/60 rounded-full block" />
      )}
    </span>
  )
}
