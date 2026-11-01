import { Backpack, Check, Radio, Waves, Zap } from 'lucide-react';
import type { ToolKind } from '../../../objects/training/ToolKind.ts';
import type { ToolDescription } from '../objects/ToolDescription.ts';

const icons = { curtain: Waves, decoy: Radio, pulse: Zap, none: Backpack };

export function ToolCard({ tool, selected, allowed, choose }: {
  tool: ToolDescription; selected: boolean; allowed: boolean; choose: (kind: ToolKind) => void;
}) {
  const Icon = icons[tool.kind];
  return <label className={`relative flex cursor-pointer gap-4 rounded-2xl border p-5 transition-colors focus-within:outline-3 focus-within:outline-offset-3 focus-within:outline-focus ${!allowed ? 'cursor-not-allowed border-line bg-paper opacity-60' : selected ? 'border-primary bg-primary/6' : 'border-line bg-surface hover:border-primary/40'}`}>
    <input type="radio" name="loadout-tool" value={tool.kind} checked={selected} disabled={!allowed} onChange={() => choose(tool.kind)} className="sr-only" />
    <span className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${selected ? 'bg-primary text-white' : 'bg-amber/20 text-ink'}`}><Icon size={23} aria-hidden /></span>
    <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className="text-base font-bold text-ink">{tool.name}</strong><span className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-primary bg-primary text-white' : 'border-line'}`}>{selected && <Check size={13} aria-hidden />}</span></span><span className="mt-1 block text-xs text-muted">{tool.subtitle}</span><span className="mt-3 block text-sm leading-6 text-ink">{tool.effect}</span><span className="mt-3 block text-xs font-semibold text-primary">{allowed ? tool.specs : '本任务不可使用'}</span></span>
  </label>;
}
