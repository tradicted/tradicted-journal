import { useState, useRef, useEffect } from 'react'
import { usePortfolio } from '../context/PortfolioContext'

export function PortfolioSelector() {
  const { portfolios, activeId, setActiveId, refresh } = usePortfolio()
  const [open, setOpen] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [addingNew, setAddingNew] = useState(false)
  const [newName, setNewName] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const newNameInputRef = useRef<HTMLInputElement>(null)

  const active = portfolios.find((p) => p.id === activeId) ?? portfolios[0]

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
        setRenamingId(null)
        setAddingNew(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (renamingId !== null) renameInputRef.current?.focus()
  }, [renamingId])

  useEffect(() => {
    if (addingNew) newNameInputRef.current?.focus()
  }, [addingNew])

  const startRename = (p: { id: string; name: string }) => {
    setRenamingId(p.id)
    setRenameValue(p.name)
  }

  const commitRename = async () => {
    if (renamingId && renameValue.trim()) {
      await window.api.portfolios.rename(renamingId, renameValue.trim())
      refresh()
    }
    setRenamingId(null)
  }

  const commitAdd = async () => {
    const name = newName.trim()
    if (name) {
      const id = crypto.randomUUID()
      await window.api.portfolios.add(id, name)
      await refresh()
    }
    setNewName('')
    setAddingNew(false)
  }

  const handleDelete = async (p: { id: string; name: string }) => {
    if (!confirm(`Delete "${p.name}"? All trades in this portfolio will be unaffected but unassigned.`)) return
    await window.api.portfolios.delete(p.id)
    if (activeId === p.id) setActiveId('default')
    refresh()
  }

  return (
    <div ref={panelRef} className="relative px-2 pb-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-700 bg-dark-bg hover:border-slate-500 transition-colors text-xs text-slate-300 font-medium"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-slate-500 text-[10px] uppercase tracking-wide flex-shrink-0">Portfolio</span>
        <span className="text-white flex-1 text-left truncate">{active?.name ?? 'Portfolio 1'}</span>
        <svg
          viewBox="0 0 24 24"
          className={`w-3 h-3 fill-none stroke-current stroke-2 text-slate-500 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
          strokeLinecap="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-2 right-2 top-[calc(100%-0.5rem)] z-30 bg-dark-elevated border border-slate-700 rounded-xl shadow-xl overflow-hidden">
          <div className="p-1">
            {portfolios.map((p) => (
              <div
                key={p.id}
                className={`flex items-center gap-2 px-2 py-2 rounded-lg group ${
                  p.id === activeId ? 'bg-slate-700/40' : 'hover:bg-slate-700/20'
                } transition-colors`}
              >
                {renamingId === p.id ? (
                  <input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename()
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                    className="flex-1 bg-dark-bg border border-slate-600 rounded px-2 py-0.5 text-xs text-white outline-none focus:border-slate-400"
                  />
                ) : (
                  <button
                    onClick={() => { setActiveId(p.id); setOpen(false) }}
                    className="flex-1 text-left text-xs truncate"
                  >
                    <span className={p.id === activeId ? 'text-white font-semibold' : 'text-slate-300'}>
                      {p.name}
                    </span>
                    {p.id === activeId && (
                      <span className="ml-2 text-[10px] text-[#1e99dc]">active</span>
                    )}
                  </button>
                )}

                {renamingId !== p.id && (
                  <button
                    onClick={() => startRename(p)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-slate-300 p-0.5 flex-shrink-0"
                    title="Rename"
                  >
                    <svg viewBox="0 0 24 24" className="w-3 h-3 fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                )}

                {p.id !== 'default' && renamingId !== p.id && (
                  <button
                    onClick={() => handleDelete(p)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-600 hover:text-red-400 p-0.5 flex-shrink-0"
                    title="Delete portfolio"
                  >
                    <svg viewBox="0 0 24 24" className="w-3 h-3 fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    </svg>
                  </button>
                )}
              </div>
            ))}

            <div className="border-t border-slate-700/60 mt-1 pt-1">
              {addingNew ? (
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <input
                    ref={newNameInputRef}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onBlur={() => { if (!newName.trim()) setAddingNew(false) }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitAdd()
                      if (e.key === 'Escape') { setAddingNew(false); setNewName('') }
                    }}
                    placeholder="Portfolio name…"
                    className="flex-1 bg-dark-bg border border-slate-600 rounded px-2 py-0.5 text-xs text-white outline-none focus:border-slate-400 placeholder-slate-600"
                  />
                  <button
                    onClick={commitAdd}
                    className="text-[11px] text-[#1e99dc] hover:text-blue-300 font-semibold flex-shrink-0"
                  >
                    Add
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingNew(true)}
                  className="w-full flex items-center gap-1.5 px-2 py-2 rounded-lg text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-700/20 transition-colors"
                >
                  <span className="text-base leading-none">+</span>
                  Add portfolio
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
