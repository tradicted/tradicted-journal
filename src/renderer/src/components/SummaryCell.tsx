export function SummaryCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-dark-surface border border-slate-800 rounded-xl p-4 text-center">
      <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  )
}
