import { useEffect, useRef, useState } from 'react'

interface TagDefinition {
  id: string
  label: string
  color: string
  negative?: boolean
}

interface GradeDefinition {
  id: string
  label: string
  color: string
}

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
  { id: 'disciplined', label: 'Disciplined', color: '#4ade80', negative: false },
  { id: 'rule-based', label: 'Rule-based', color: '#34d399', negative: false },
  { id: 'fomo', label: 'FOMO', color: '#f87171', negative: true },
  { id: 'revenge', label: 'Revenge', color: '#ef4444', negative: true },
  { id: 'hesitated', label: 'Hesitated', color: '#fbbf24', negative: true },
  { id: 'overconfident', label: 'Overconfident', color: '#fb923c', negative: true },
]

const DEFAULT_GRADES: GradeDefinition[] = [
  { id: 'A', label: 'A', color: '#4ade80' },
  { id: 'B', label: 'B', color: '#fbbf24' },
  { id: 'C', label: 'C', color: '#f87171' },
]

export default function Settings() {
  const [commission, setCommission] = useState('0')
  const [setupTags, setSetupTags] = useState<TagDefinition[]>(DEFAULT_SETUP_TAGS)
  const [psychTags, setPsychTags] = useState<TagDefinition[]>(DEFAULT_PSYCH_TAGS)
  const [grades, setGrades] = useState<GradeDefinition[]>(DEFAULT_GRADES)
  const [loading, setLoading] = useState(true)
  const [tagsOpen, setTagsOpen] = useState(false)
  const [csvStatus, setCsvStatus] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      window.api.settings.get('commission'),
      window.api.settings.get('setupTags'),
      window.api.settings.get('psychTags'),
      window.api.settings.get('grades'),
    ]).then(([comm, setup, psych, gr]) => {
      if (comm != null) setCommission(comm)
      if (setup != null) {
        try { setSetupTags(JSON.parse(setup)) } catch { /* keep default */ }
      }
      if (psych != null) {
        try { setPsychTags(JSON.parse(psych)) } catch { /* keep default */ }
      }
      if (gr != null) {
        try { setGrades(JSON.parse(gr)) } catch { /* keep default */ }
      }
      setLoading(false)
    })
  }, [])

  const saveCommission = (val: string) => window.api.settings.set('commission', val)

  const updateSetupTags = (tags: TagDefinition[]) => {
    setSetupTags(tags)
    window.api.settings.set('setupTags', JSON.stringify(tags))
  }

  const updatePsychTags = (tags: TagDefinition[]) => {
    setPsychTags(tags)
    window.api.settings.set('psychTags', JSON.stringify(tags))
  }

  const updateGrades = (gr: GradeDefinition[]) => {
    setGrades(gr)
    window.api.settings.set('grades', JSON.stringify(gr))
  }

  const handleExportCSV = async () => {
    setCsvStatus(null)
    const result = await window.api.data.exportCSV()
    if (result.success) setCsvStatus('Exported successfully.')
    else setCsvStatus(null)
  }

  const handleImportCSV = async (importSettings: boolean) => {
    setCsvStatus(null)
    const result = await window.api.data.importCSV(importSettings)
    if (result.cancelled) return
    if (!result.success) { setCsvStatus(`Import failed: ${result.error ?? 'unknown error'}`); return }
    const parts: string[] = []
    if ((result.imported ?? 0) > 0) parts.push(`${result.imported} imported`)
    if ((result.skipped ?? 0) > 0) parts.push(`${result.skipped} updated`)
    if (result.errors && result.errors.length > 0) parts.push(`${result.errors.length} error(s)`)
    setCsvStatus(parts.length ? parts.join(', ') + '.' : 'Nothing new to import.')
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-slate-500">Loading…</div>
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-white mb-5">Settings</h1>

      <div className="bg-dark-surface border border-dark-border rounded-2xl divide-y divide-dark-border">

        {/* Commission */}
        <div className="px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-white">Commission per trade</p>
              <p className="text-xs text-slate-500 mt-0.5">Round-trip fee deducted from P&amp;L</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-slate-400 text-xs">$</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={commission}
                onChange={(e) => { setCommission(e.target.value); saveCommission(e.target.value) }}
                onBlur={(e) => saveCommission(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="w-24 bg-dark-bg border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/40 transition-colors text-right"
                placeholder="0"
              />
            </div>
          </div>
        </div>

        {/* Tags & Grades — collapsible */}
        <div>
          <button
            onClick={() => setTagsOpen((o) => !o)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-white">Tags &amp; Grades</p>
              <p className="text-xs text-slate-500 mt-0.5">Customize labels for trade classification</p>
            </div>
            <svg
              viewBox="0 0 24 24"
              className={`w-4 h-4 text-slate-500 flex-shrink-0 transition-transform ${tagsOpen ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {tagsOpen && (
            <div className="px-5 pb-5 space-y-5">
              <TagSection
                title="Setup Tags"
                tags={setupTags}
                defaultColor="#1e99dc"
                onChange={updateSetupTags}
              />
              <div className="border-t border-dark-border pt-5">
                <TagSection
                  title="Psychology Tags"
                  tags={psychTags}
                  defaultColor="#5c49ac"
                  onChange={updatePsychTags}
                  showNegativeToggle
                />
              </div>
              <div className="border-t border-dark-border pt-5">
                <GradeSection grades={grades} onChange={updateGrades} />
              </div>
            </div>
          )}
        </div>

        {/* CSV Import / Export */}
        <div className="px-5 py-4">
          <p className="text-sm font-medium text-white mb-1">CSV Import / Export</p>
          <p className="text-xs text-slate-500 mb-3">
            Compatible with the Tradicted web app. Exports raw trade data for this portfolio — no calculated values.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 text-xs rounded-lg bg-primary-600 hover:bg-primary-500 text-white transition-colors"
            >
              Export CSV
            </button>
            <button
              onClick={() => handleImportCSV(false)}
              className="px-3 py-1.5 text-xs rounded-lg bg-dark-bg border border-slate-700 hover:border-slate-500 text-slate-300 transition-colors"
            >
              Import CSV (trades only)
            </button>
            <button
              onClick={() => handleImportCSV(true)}
              className="px-3 py-1.5 text-xs rounded-lg bg-dark-bg border border-slate-700 hover:border-slate-500 text-slate-300 transition-colors"
            >
              Import CSV + settings
            </button>
          </div>
          {csvStatus && (
            <p className="mt-2 text-xs text-slate-400">{csvStatus}</p>
          )}
        </div>

      </div>
    </div>
  )
}

function TagSection({
  title, tags, defaultColor, onChange, showNegativeToggle = false,
}: {
  title: string
  tags: TagDefinition[]
  defaultColor: string
  onChange: (tags: TagDefinition[]) => void
  showNegativeToggle?: boolean
}) {
  const addTag = () => {
    const id = `custom-${Date.now()}`
    onChange([...tags, { id, label: 'New tag', color: defaultColor, ...(showNegativeToggle ? { negative: false } : {}) }])
  }
  const updateTag = (idx: number, patch: Partial<TagDefinition>) =>
    onChange(tags.map((t, i) => (i === idx ? { ...t, ...patch } : t)))
  const deleteTag = (idx: number) => onChange(tags.filter((_, i) => i !== idx))

  return (
    <div>
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">{title}</p>
      <div className="space-y-1.5">
        {tags.map((tag, idx) => (
          <TagRow
            key={tag.id}
            tag={tag}
            onUpdate={(patch) => updateTag(idx, patch)}
            onDelete={() => deleteTag(idx)}
            showNegativeToggle={showNegativeToggle}
          />
        ))}
      </div>
      <button
        onClick={addTag}
        className="mt-2 text-[11px] text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
      >
        <span className="text-sm leading-none">+</span> Add
      </button>
    </div>
  )
}

function TagRow({
  tag, onUpdate, onDelete, showNegativeToggle = false,
}: {
  tag: TagDefinition
  onUpdate: (patch: Partial<TagDefinition>) => void
  onDelete: () => void
  showNegativeToggle?: boolean
}) {
  const colorRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => colorRef.current?.click()}
        className="w-4 h-4 rounded-sm flex-shrink-0 border border-white/20 hover:scale-110 transition-transform"
        style={{ backgroundColor: tag.color }}
        title="Change color"
      />
      <input ref={colorRef} type="color" value={tag.color}
        onChange={(e) => onUpdate({ color: e.target.value })}
        className="sr-only" tabIndex={-1}
      />
      <input
        type="text"
        value={tag.label}
        onChange={(e) => onUpdate({ label: e.target.value })}
        className="flex-1 bg-dark-bg border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-slate-500 transition-colors min-w-0"
      />
      {showNegativeToggle && (
        <button
          type="button"
          onClick={() => onUpdate({ negative: !tag.negative })}
          title={tag.negative ? 'Negative — click to unmark' : 'Click to mark as negative'}
          className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 transition-colors ${
            tag.negative
              ? 'border-red-400/50 text-red-400 bg-red-400/10'
              : 'border-slate-700 text-slate-500 hover:border-slate-500'
          }`}
        >
          neg
        </button>
      )}
      <button onClick={onDelete}
        className="text-slate-600 hover:text-red-400 transition-colors text-xs flex-shrink-0"
        aria-label={`Delete ${tag.label}`}
      >✕</button>
    </div>
  )
}

function GradeSection({
  grades, onChange,
}: {
  grades: GradeDefinition[]
  onChange: (grades: GradeDefinition[]) => void
}) {
  const addGrade = () => {
    const id = `grade-${Date.now()}`
    onChange([...grades, { id, label: 'New', color: '#94a3b8' }])
  }
  const updateGrade = (idx: number, patch: Partial<GradeDefinition>) =>
    onChange(grades.map((g, i) => (i === idx ? { ...g, ...patch } : g)))
  const deleteGrade = (idx: number) => onChange(grades.filter((_, i) => i !== idx))

  return (
    <div>
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Grades</p>
      <div className="space-y-1.5">
        {grades.map((grade, idx) => (
          <GradeRow
            key={grade.id}
            grade={grade}
            onUpdate={(patch) => updateGrade(idx, patch)}
            onDelete={() => deleteGrade(idx)}
          />
        ))}
      </div>
      <button
        onClick={addGrade}
        className="mt-2 text-[11px] text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
      >
        <span className="text-sm leading-none">+</span> Add
      </button>
    </div>
  )
}

function GradeRow({
  grade, onUpdate, onDelete,
}: {
  grade: GradeDefinition
  onUpdate: (patch: Partial<GradeDefinition>) => void
  onDelete: () => void
}) {
  const colorRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => colorRef.current?.click()}
        className="w-4 h-4 rounded-sm flex-shrink-0 border border-white/20 hover:scale-110 transition-transform"
        style={{ backgroundColor: grade.color }}
        title="Change color"
      />
      <input ref={colorRef} type="color" value={grade.color}
        onChange={(e) => onUpdate({ color: e.target.value })}
        className="sr-only" tabIndex={-1}
      />
      <input
        type="text"
        value={grade.label}
        onChange={(e) => onUpdate({ label: e.target.value })}
        className="w-20 bg-dark-bg border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-slate-500 transition-colors"
        placeholder="A"
      />
      <button onClick={onDelete}
        className="text-slate-600 hover:text-red-400 transition-colors text-xs flex-shrink-0 ml-auto"
        aria-label={`Delete ${grade.label}`}
      >✕</button>
    </div>
  )
}
