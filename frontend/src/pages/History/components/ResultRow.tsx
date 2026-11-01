import { ArrowUpRight, Flag, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { TrainingResult } from '../../../objects/records/TrainingResult.ts';
import { formatAccuracy, formatDate, formatElapsed } from '../../Result/utils/formatResult.ts';

export function ResultRow({ result }: { result: TrainingResult }) {
  const victory = result.outcome === 'victory';
  return <li>
    <Link to={`/results/${result.runId}`} className="group grid min-h-24 grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-line py-5 transition-colors hover:bg-surface/70 sm:grid-cols-[auto_1.5fr_1fr_1fr_1fr_auto] sm:px-3" aria-label={`${formatDate(result.submittedAt)}，${victory ? '通关' : '未通关'}，击毁 ${result.destroyed} 架，用时 ${formatElapsed(result.elapsedMs)}，查看详情`}>
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${victory ? 'bg-amber/25 text-ink' : 'bg-danger/10 text-danger'}`}>{victory ? <Trophy size={20} aria-hidden="true" /> : <Flag size={20} aria-hidden="true" />}</span>
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-x-3"><span className="font-semibold text-ink">{victory ? '成功通关' : '未通关'}</span><span className="text-xs text-muted">{formatDate(result.submittedAt)}</span></div><p className="mt-1 truncate text-xs text-muted" title={result.configVersion}>{result.configVersion}</p><p className="mt-2 text-sm text-muted sm:hidden">击毁 {result.destroyed} 架 · {formatElapsed(result.elapsedMs)} · 命中率 {formatAccuracy(result.hits, result.shotsFired)}</p></div>
      <span className="hidden text-sm tabular-nums text-ink sm:block"><span className="sr-only">击毁</span>{result.destroyed} 架</span>
      <span className="hidden text-sm tabular-nums text-ink sm:block"><span className="sr-only">用时</span>{formatElapsed(result.elapsedMs)}</span>
      <span className="hidden text-sm tabular-nums text-ink sm:block"><span className="sr-only">命中率</span>{formatAccuracy(result.hits, result.shotsFired)}</span>
      <ArrowUpRight size={19} className="text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  </li>;
}
