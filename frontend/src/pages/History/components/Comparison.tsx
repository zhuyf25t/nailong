import { Link } from 'react-router-dom';
import type { TrainingResult } from '../../../objects/records/TrainingResult.ts';
import { formatElapsed, formatAccuracy, formatDate } from '../../Result/utils/formatResult.ts';
import { missionTitle } from '../functions/archive.ts';

export function Comparison({ results, close }: { results: readonly TrainingResult[]; close: () => void }) {
  if (results.length !== 2) return null;
  return <section className="my-6 rounded-3xl border border-primary/25 bg-surface p-5 sm:p-7" aria-label="两局对比">
    <div className="mb-5 flex items-center justify-between gap-4"><div><p className="text-xs tracking-widest text-muted">SAME FIELD / DIFFERENT CHOICES</p><h2 className="mt-2 text-xl font-bold">同一片花谷，两次行动</h2></div><button className="min-h-11 rounded-xl px-3 text-sm text-primary underline" onClick={close}>清除对比</button></div>
    <p className="mb-5 text-sm text-muted">{missionTitle(results[0])} · 地图版本、目标、规则、地形与携带工具相同。用时包含不同打法，不据此推断失败原因。</p>
    <div className="grid gap-4 sm:grid-cols-2">{results.map(result => <article key={result.runId} className="rounded-2xl bg-paper p-5">
      <p className="text-xs text-muted">{formatDate(result.submittedAt)}</p><h3 className="mt-2 text-lg font-bold">{result.outcome === 'victory' ? '任务完成' : '行动未完成'}</h3>
      <dl className="my-4 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-muted">用时</dt><dd className="mt-1 font-semibold">{formatElapsed(result.elapsedMs)}</dd></div><div><dt className="text-muted">击毁</dt><dd className="mt-1 font-semibold">{result.destroyed} 架</dd></div><div><dt className="text-muted">发射</dt><dd className="mt-1 font-semibold">{result.shotsFired} 发</dd></div><div><dt className="text-muted">命中率</dt><dd className="mt-1 font-semibold">{formatAccuracy(result.hits, result.shotsFired)}</dd></div></dl>
      <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline" to={`/results/${result.runId}`}>打开这局报告</Link>
    </article>)}</div>
  </section>;
}
