import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Film, Radar, RefreshCw } from 'lucide-react';
import { GetRunEventsAPI } from '../../../apis/records/GetRunEventsAPI.ts';
import type { TrainingResult } from '../../../objects/records/TrainingResult.ts';
import type { RunEventSummary } from '../../../objects/records/RunEventSummary.ts';
import { runEventLabel } from '../../../objects/records/runEventLabel.ts';
import { useSession } from '../../../system/session/SessionProvider.tsx';
import { formatElapsed } from '../utils/formatResult.ts';
import { useReplays } from '../../../system/replays/ReplaysProvider.tsx';

export function EventReport({ result }: { result: TrainingResult }) {
  const { state: session } = useSession();
  const token = session.kind === 'signed-in' ? session.token : undefined;
  const replays = useReplays();
  const queueState = replays.getStatus(result.playerId, result.runId);
  const [summary, setSummary] = useState<RunEventSummary | null>(null);
  const [local, setLocal] = useState(false);
  const [status, setStatus] = useState<'loading' | 'missing' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading'); setSummary(null); setLocal(false);
    const load = async () => {
      const [remote, saved] = await Promise.allSettled([
        new GetRunEventsAPI(result.runId).send({ token, signal: controller.signal }),
        replays.getLocal(result.playerId, result.runId),
      ]);
      if (controller.signal.aborted) return;
      if (remote.status === 'fulfilled' && remote.value.status === 'available') { setSummary(remote.value.summary); setStatus('ready'); }
      else if (saved.status === 'fulfilled' && saved.value) { setSummary(saved.value.summary); setLocal(true); setStatus('ready'); }
      else setStatus(remote.status === 'rejected' ? 'error' : 'missing');
    };
    void load();
    return () => controller.abort();
  }, [result.runId, result.playerId, token, attempt, queueState?.events.status]);
  const events = summary?.events.filter(event => event.kind !== 'shot' && event.kind !== 'hit') ?? [];
  const firstLock = summary?.events.find(event => event.kind === 'drone-state' && event.detail?.startsWith('locked'));
  const objective = summary?.events.find(event => event.kind === 'beacon') ?? [...(summary?.events ?? [])].reverse().find(event => event.kind === 'destroyed');
  const replayHref = `/replays/${result.runId}${result.outcome === 'defeat' ? '?ending=1' : objective ? `?t=${Math.max(0, objective.tMs - 2500)}` : ''}`;
  return <section className="mt-6 rounded-3xl border border-line bg-surface p-6 sm:p-8" aria-label="真实行动过程">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs tracking-[.18em] text-muted">THE MOMENTS THAT MATTER</p><h2 className="mt-2 text-xl font-bold">这局发生了什么</h2></div>{result.setup && <Link to={replayHref} className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-primary px-5 text-sm font-semibold text-white"><Film size={17} />{result.outcome === 'defeat' ? '回看最后八秒' : '打开战术回放'}</Link>}</div>
    {status === 'loading' && <p role="status" className="mt-5 text-sm text-muted">正在读取真实事件记录…</p>}
    {status === 'missing' && <p className="mt-5 text-sm leading-7 text-muted">{result.setup ? '这局的成绩已保存，过程记录尚未到达服务器。如果刚结束行动，请稍后刷新；待上传内容保留在开始本局的设备中。' : '这是早期版本的成绩摘要。当时没有采集位置、扫描和射击过程，因此没有可恢复的真实回放。新任务会开始记录。'}</p>}
    {status === 'error' && <p role="status" className="mt-5 text-sm text-danger">事件暂时没有读到，已保存的成绩不受影响。</p>}
    {(status === 'missing' && !!result.setup || status === 'error') && <button className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary" onClick={() => setAttempt(value => value + 1)}><RefreshCw size={16} />重新读取过程记录</button>}
    {summary && <>
      {local && <p className="mt-4 rounded-xl bg-amber/15 p-3 text-xs leading-6 text-muted">正在展示本机采集的真实事件，云端保存仍在等待。{queueState?.events.message} <button className="min-h-9 text-primary underline" onClick={() => void replays.retry(result.runId)}>重试补传</button></p>}
      <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-paper p-4"><p className="text-xs text-muted">{summary.truncated ? '已保留事件中的锁定' : '首次被锁定'}</p><p className="mt-2 font-semibold">{firstLock ? formatElapsed(firstLock.tMs) : summary.truncated ? '保留范围内没有锁定事件' : '本局未记录到锁定'}</p></div><div className="rounded-2xl bg-paper p-4"><p className="text-xs text-muted">战术工具</p><p className="mt-2 font-semibold">{summary.events.some(event => event.kind === 'tool') ? '已使用 · 时间见下方' : summary.truncated ? '保留范围内没有使用事件' : '本局未使用'}</p></div></div>
      <p className="my-5 text-xs leading-6 text-muted">以下只列实际记录的关键事件。回放会检查这些时刻是否在保存范围内；片段以外保留文字摘要。{summary.truncated && '本局事件较多，摘要只保留了后段，不能据此判断整局首次暴露。'}</p>
      <ol className="max-h-96 space-y-1 overflow-auto pr-2">{events.map(event => <li key={event.seq} className="flex items-center gap-3 border-b border-line py-3 text-sm"><span className="w-20 shrink-0 font-mono text-xs text-muted">{formatElapsed(event.tMs)}</span><span className="flex-1">{runEventLabel(event)}</span>{result.setup && <Link className="inline-flex min-h-10 items-center rounded-xl px-3 text-xs text-primary underline" to={`/replays/${result.runId}?t=${Math.max(0, event.tMs - 2500)}`}>查看附近</Link>}</li>)}</ol>
      {events.length === 0 && <p className="py-4 text-sm text-muted">还没有可展示的关键事件。</p>}
      <Link to="/academy" className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"><Radar size={17} />去训练课堂，亲手试一次视线与工具</Link>
    </>}
  </section>;
}
