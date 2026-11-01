import { Crosshair, Flag, Timer, Trophy } from 'lucide-react';
import type { ResultSubmission } from '../../../objects/records/ResultSubmission.ts';
import { formatAccuracy, formatElapsed } from '../utils/formatResult.ts';

export interface ResultSummaryProps {
  submission: ResultSubmission;
  totalDrones?: number;
  showHeading?: boolean;
}

/** The same factual summary works for a frozen local finish and a saved result. */
export function ResultSummary({ submission, totalDrones, showHeading = true }: ResultSummaryProps) {
  const victory = submission.outcome === 'victory';
  return (
    <section aria-label="本局成绩" className="space-y-6">
      {showHeading && <div className="flex items-start gap-4">
        <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${victory ? 'bg-amber/25 text-ink' : 'bg-danger/10 text-danger'}`}>
          {victory ? <Trophy size={26} aria-hidden="true" /> : <Flag size={26} aria-hidden="true" />}
        </span>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-ink">{victory ? '花谷安全啦！' : '被无人机追上了'}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{victory ? '全部无人机已经清除，记下这一刻。' : '避开红色扫描，利用箱子和山坡拉开距离。'}</p>
        </div>
      </div>}
      <dl className="grid grid-cols-2 gap-4 border-y border-line py-5">
        <div>
          <dt className="flex items-center gap-2 text-sm text-muted"><Crosshair size={16} aria-hidden="true" />击毁无人机</dt>
          <dd className="mt-2 text-3xl font-bold tabular-nums text-ink">{submission.destroyed}<span className="ml-2 text-base font-normal text-muted">{totalDrones === undefined ? '架' : `/ ${totalDrones}`}</span></dd>
        </div>
        <div>
          <dt className="flex items-center gap-2 text-sm text-muted"><Timer size={16} aria-hidden="true" />本局用时</dt>
          <dd className="mt-2 text-2xl font-bold tabular-nums text-ink">{formatElapsed(submission.elapsedMs)}</dd>
        </div>
      </dl>
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div><dt className="text-sm text-muted">命中</dt><dd className="mt-1 text-xl font-semibold tabular-nums text-ink">{submission.hits}</dd></div>
        <div><dt className="text-sm text-muted">发射</dt><dd className="mt-1 text-xl font-semibold tabular-nums text-ink">{submission.shotsFired}</dd></div>
        <div><dt className="text-sm text-muted">命中率</dt><dd className="mt-1 text-xl font-semibold tabular-nums text-ink">{formatAccuracy(submission.hits, submission.shotsFired)}</dd></div>
      </dl>
    </section>
  );
}
