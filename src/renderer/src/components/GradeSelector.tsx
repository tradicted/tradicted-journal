import type { GradeDefinition } from '../types'

interface Props {
  grades: GradeDefinition[]
  value: string | null
  onChange: (next: string | null) => void
}

export function GradeSelector({ grades, value, onChange }: Props) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1.5">Trade Grade</label>
      <div className="flex flex-wrap gap-1.5">
        {grades.map((g) => {
          const selected = value === g.id
          const hex = g.color || '#4ade80'
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => onChange(selected ? null : g.id)}
              className={`min-w-[2.25rem] h-9 px-2 rounded-md border text-sm font-bold transition-colors ${
                selected ? 'border-current' : 'bg-transparent border-slate-700 text-slate-500 hover:text-slate-200 hover:border-slate-500'
              }`}
              style={selected ? { color: hex, borderColor: hex, backgroundColor: `${hex}26` } : undefined}
              aria-pressed={selected}
              aria-label={`Grade ${g.label}`}
            >
              {g.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
