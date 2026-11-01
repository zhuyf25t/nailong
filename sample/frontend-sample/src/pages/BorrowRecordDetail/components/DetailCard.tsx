import type { LucideIcon } from 'lucide-react'

export function DetailCard({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4">
      <div className="mb-3 flex size-9 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm">
        <Icon className="size-4" />
      </div>
      <div className="space-y-1">
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-sm font-medium text-slate-900">{value}</p>
      </div>
    </div>
  )
}
