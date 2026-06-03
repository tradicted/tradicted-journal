import type { TagDefinition } from '../types'

interface Props {
  label: string
  tags: TagDefinition[]
  value: string | null
  onChange: (next: string | null) => void
}

export function TagChips({ label, tags, value, onChange }: Props) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => {
          const selected = value === tag.id
          const hex = tag.color || '#1e99dc'
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => onChange(selected ? null : tag.id)}
              className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                selected
                  ? 'border-current'
                  : 'bg-transparent border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500'
              }`}
              style={selected ? { color: hex, borderColor: hex, backgroundColor: `${hex}26` } : undefined}
              aria-pressed={selected}
            >
              {tag.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
