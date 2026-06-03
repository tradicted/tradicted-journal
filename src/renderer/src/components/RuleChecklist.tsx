import type { PlanRule } from '../types'

function ruleLabel(text: string, name: string): string {
  if (name.trim()) return name.trim()
  const t = text.trim()
  return t.length > 60 ? t.slice(0, 57) + '…' : t
}

interface Props {
  plan: PlanRule[]
  checkedIds: string[]
  onChange: (ids: string[]) => void
}

export function RuleChecklist({ plan, checkedIds, onChange }: Props) {
  const toggle = (id: string) =>
    onChange(
      checkedIds.includes(id)
        ? checkedIds.filter((x) => x !== id)
        : [...checkedIds, id]
    )

  return (
    <div className="space-y-0.5">
      {plan.map((rule) => {
        if (!rule.hasOptions) {
          const checked = checkedIds.includes(rule.id)
          return (
            <button
              key={rule.id}
              type="button"
              onClick={() => toggle(rule.id)}
              className="w-full flex items-center gap-2.5 py-1.5 text-left group/row"
            >
              <RuleCheckbox checked={checked} />
              <span className="text-xs font-mono text-slate-600 w-5 flex-shrink-0">{rule.number}.</span>
              <span className={`text-xs flex-1 transition-colors ${checked ? 'text-slate-300' : 'text-slate-400 group-hover/row:text-slate-200'}`}>
                {ruleLabel(rule.text, rule.name)}
              </span>
            </button>
          )
        }

        const optIds = rule.options.map((o) => o.id)
        const checkedCount = optIds.filter((id) => checkedIds.includes(id)).length
        const allChecked = optIds.length > 0 && checkedCount === optIds.length
        const someChecked = checkedCount > 0 && !allChecked

        return (
          <div key={rule.id}>
            <button
              type="button"
              onClick={() =>
                onChange(
                  allChecked
                    ? checkedIds.filter((id) => !optIds.includes(id))
                    : [...new Set([...checkedIds, ...optIds])]
                )
              }
              className="w-full flex items-center gap-2.5 py-1.5 text-left group/row"
            >
              <RuleCheckbox checked={allChecked} indeterminate={someChecked} />
              <span className="text-xs font-mono text-slate-600 w-5 flex-shrink-0">{rule.number}.</span>
              <span className="text-xs text-slate-400 group-hover/row:text-slate-200 transition-colors flex-1">
                {ruleLabel(rule.text, rule.name)}
              </span>
            </button>
            {rule.options.map((opt) => {
              const checked = checkedIds.includes(opt.id)
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggle(opt.id)}
                  className="w-full flex items-center gap-2.5 py-1 pl-8 text-left group/row"
                >
                  <RuleCheckbox checked={checked} />
                  <span className="text-xs font-mono text-slate-600 w-4 flex-shrink-0">{opt.letter}.</span>
                  <span className={`text-xs flex-1 transition-colors ${checked ? 'text-slate-300' : 'text-slate-400 group-hover/row:text-slate-200'}`}>
                    {ruleLabel(opt.text, opt.name)}
                  </span>
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function RuleCheckbox({ checked, indeterminate }: { checked: boolean; indeterminate?: boolean }) {
  return (
    <span
      className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
        checked || indeterminate
          ? 'border-[#5c49ac] bg-[#5c49ac]/70'
          : 'border-slate-600 group-hover/row:border-slate-400'
      }`}
    >
      {checked && (
        <svg viewBox="0 0 12 12" className="w-2 h-2 text-white fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="2 6 5 9 10 3" />
        </svg>
      )}
      {indeterminate && !checked && (
        <span className="w-1.5 h-px bg-[#a497d8] rounded-full block" />
      )}
    </span>
  )
}
