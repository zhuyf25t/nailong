import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Film, Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import { GetRunReplayAPI } from '../../apis/records/GetRunReplayAPI.ts';
import { GetRunEventsAPI } from '../../apis/records/GetRunEventsAPI.ts';
import { verifyReplayEnvelope } from '../../objects/records/ReplayEnvelope.ts';
import type { ReplayPayload } from '../../objects/records/ReplayPayload.ts';
import type { RunEventSummary } from '../../objects/records/RunEventSummary.ts';
import { parseRunId } from '../../objects/training/RunId.ts';
import { useSession } from '../../system/session/SessionProvider.tsx';
import { useReplays } from '../../system/replays/ReplaysProvider.tsx';
import { ApiError } from '../../system/api/ApiError.ts';
import { DecodeError } from '../../system/api/DecodeError.ts';
import { Button } from '../../components/ui/Button.tsx';
import { clampReplayTime, eventJumpTime, eventLabel, replayTimeLabel } from './player.ts';
import { mountReplay, type ReplayView } from './mountReplay.ts';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'missing'; summary: RunEventSummary | null }
  | { kind: 'ready'; payload: ReplayPayload; summary: RunEventSummary | null; source: 'local' | 'cloud'; warning: string | null };

export default function Replay() {
  const { runId: rawRunId } = useParams<{ runId: string }>();
  const [search] = useSearchParams();
  const { state: session, invalidate } = useSession();
  const { getLocal } = useReplays();
  const ownerId = session.kind === 'signed-in' ? session.player.id : undefined;
  const token = session.kind === 'signed-in' ? session.token : undefined;
  const identity = `${ownerId ?? 'none'}:${rawRunId ?? ''}`;
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ identity: string; value: LoadState }>({ identity, value: { kind: 'loading' } });
  const state: LoadState = loaded.identity === identity ? loaded.value : { kind: 'loading' };
  useEffect(() => {
    const controller = new AbortController();
    const publish = (value: LoadState) => { if (!controller.signal.aborted) setLoaded({ identity, value }); };
    publish({ kind: 'loading' });
    async function load() {
      let runId;
      try { runId = parseRunId(rawRunId); }
      catch { publish({ kind: 'error', message: '回放地址不完整，请从战局详情进入。' }); return; }
      if (!ownerId || !token) { if (session.kind !== 'checking') publish({ kind: 'error', message: '请登录这局所属的账号后查看回放。' }); return; }
      let warning: string | null = null;
      try {
        const local = await getLocal(ownerId, runId);
        if (controller.signal.aborted) return;
        if (local) {
          const payload = await verifyReplayEnvelope(local.replay);
          if (payload.manifest.runId !== runId) throw new Error('回放与当前局次不一致。');
          publish({ kind: 'ready', payload, summary: local.summary, source: 'local', warning: null }); return;
        }
      } catch { warning = '本机缓存无法通过完整性检查或暂时不可读，正在使用云端副本。'; }
      const [replayResult, eventResult] = await Promise.allSettled([
        new GetRunReplayAPI(runId).send({ signal: controller.signal, token }),
        new GetRunEventsAPI(runId).send({ signal: controller.signal, token }),
      ]);
      if (controller.signal.aborted) return;
      const summary = eventResult.status === 'fulfilled' && eventResult.value.status === 'available' ? eventResult.value.summary : null;
      if (replayResult.status === 'rejected') {
        const error: unknown = replayResult.reason;
        if (error instanceof ApiError && (error.status === 401 || error.kind === 'auth')) invalidate(token);
        const message = error instanceof DecodeError ? '回放格式或版本无法验证，未尝试使用新场景替代。'
          : error instanceof ApiError && (error.status === 403 || error.status === 404) ? '这条回放不存在，或不属于当前账号。'
          : '暂时无法读取回放。请检查网络，或返回战局详情确认本机回放是否仍在待上传。';
        publish({ kind: 'error', message }); return;
      }
      const result = replayResult.value;
      if (result.status === 'missing_legacy') { publish({ kind: 'missing', summary }); return; }
      if (result.status === 'unsupported_version') { publish({ kind: 'error', message: `这条回放使用格式版本 ${result.formatVersion}，当前播放器尚不支持。成绩和事件摘要仍可查看。` }); return; }
      try {
        const payload = await verifyReplayEnvelope(result.replay);
        if (payload.manifest.runId !== runId) throw new Error('局次不符');
        publish({ kind: 'ready', payload, summary, source: 'cloud', warning });
      } catch { publish({ kind: 'error', message: '回放完整性、格式或局次校验失败，已停止播放。请重新读取；原成绩不受影响。' }); }
    }
    void load();
    return () => controller.abort();
  }, [identity, rawRunId, ownerId, token, session.kind, getLocal, invalidate, attempt]);

  return <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
    <Link to={rawRunId ? `/results/${rawRunId}` : '/history'} className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline"><ArrowLeft size={17} aria-hidden="true" />返回战局详情</Link>
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="mb-2 text-xs font-semibold tracking-[0.2em] text-muted">FIELD NOTES · REPLAY</p><h1 tabIndex={-1} className="text-3xl font-bold tracking-tight text-ink">回到那一刻</h1></div><span className="rounded-full border border-line bg-surface px-4 py-2 text-xs font-semibold text-muted">只读战局复盘</span></div>
    {state.kind === 'loading' && <section role="status" className="rounded-3xl border border-line bg-surface p-10 text-muted">正在读取本人的回放并验证内容…</section>}
    {state.kind === 'error' && <section role="alert" className="rounded-3xl border border-line bg-surface p-8"><Film className="mb-4 text-muted" /><h2 className="text-xl font-bold">回放暂时无法播放</h2><p className="my-5 leading-relaxed text-muted">{state.message}</p><Button variant="secondary" onClick={() => setAttempt(value => value + 1)}>重新读取</Button></section>}
    {state.kind === 'missing' && <section className="rounded-3xl border border-line bg-surface p-8"><Film className="mb-4 text-muted" /><h2 className="text-xl font-bold">这局没有可播放的录像</h2><p className="mt-4 leading-relaxed text-muted">较早的战局仅保存成绩，无法事后还原真实移动与交战。如果是刚结束的新局，请先在战局详情完成回放上传。</p>{state.summary && <div className="mt-7 border-t border-line pt-5"><h3 className="font-semibold">已保存的事件摘要</h3><ul className="mt-3 space-y-2 text-sm text-muted">{state.summary.events.filter(event => event.kind !== 'shot').slice(-30).map(event => <li key={event.seq}>{replayTimeLabel(event.tMs)} · {eventLabel(event)}</li>)}</ul></div>}</section>}
    {state.kind === 'ready' && <ReplayTheater key={`${identity}:${attempt}`} payload={state.payload} summary={state.summary} source={state.source} warning={state.warning} requestedTime={search.get('t')} ending={search.get('ending') === '1'} />}
  </main>;
}

function ReplayTheater({ payload, summary, source, warning, requestedTime, ending }: { payload: ReplayPayload; summary: RunEventSummary | null; source: 'local' | 'cloud'; warning: string | null; requestedTime: string | null; ending: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null), viewer = useRef<ReplayView | null>(null);
  const coverage = payload.manifest.coverage;
  const rawStart = ending ? coverage.resultAtMs - 8000 : requestedTime !== null && Number.isFinite(Number(requestedTime)) ? Number(requestedTime) : coverage.fromMs;
  const startTime = clampReplayTime(payload, rawStart);
  const desiredStart = useRef(startTime); desiredStart.current = startTime;
  const [time, setTime] = useState(startTime), [playing, setPlaying] = useState(false), [ready, setReady] = useState(false);
  const [progress, setProgress] = useState('准备场景资源…'), [renderError, setRenderError] = useState<string | null>(null);
  const [speed, setSpeed] = useState('1'), [cameraMode, setCameraMode] = useState<'original' | 'overhead'>('original');
  const [scans, setScans] = useState(true), [path, setPath] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<number | null>(null);
  const [notice, setNotice] = useState(rawStart < coverage.fromMs || rawStart > coverage.toMs ? '所选时刻不在已保留片段内，已定位到最近的真实记录位置。' : '');
  useEffect(() => {
    const controller = new AbortController(); let current: ReplayView | null = null;
    if (canvas.current) void mountReplay(canvas.current, payload, {
      signal: controller.signal, onProgress: (count, total) => setProgress(`正在加载场景 ${count}/${total}…`),
      onTime: setTime, onPlaying: setPlaying, onError: setRenderError,
    }).then(view => {
      if (controller.signal.aborted) { view.dispose(); return; }
      current = view; viewer.current = view; view.seek(desiredStart.current); setReady(true);
    }).catch(error => { if (!controller.signal.aborted) setRenderError(error instanceof Error ? error.message : '场景资源暂时无法加载。'); });
    return () => { controller.abort(); current?.dispose(); viewer.current = null; };
    // URL changes position playback below without reloading GLBs.
  }, [payload]);
  useEffect(() => {
    viewer.current?.seek(startTime); setTime(startTime);
    setNotice(rawStart < coverage.fromMs || rawStart > coverage.toMs ? '所选时刻不在已保留片段内，已定位到最近的真实记录位置。' : '');
  }, [startTime, rawStart, coverage.fromMs, coverage.toMs]);
  const events = (summary?.events ?? payload.events).filter(event => event.kind !== 'shot');
  const seek = (value: number) => { setSelectedEvent(null); viewer.current?.play(false); viewer.current?.seek(value); };
  const jump = (index: number) => {
    const event = events[index]; if (!event) return;
    if (event.tMs < coverage.fromMs || event.tMs > coverage.toMs) { setNotice('这个事件仅保留了摘要，不在当前录像片段中。'); return; }
    setNotice(''); seek(eventJumpTime(payload, event)); setSelectedEvent(index);
  };
  let previousEvent = -1;
  events.forEach((event, index) => { if (event.tMs < time - 50 && event.tMs >= coverage.fromMs) previousEvent = index; });
  if (selectedEvent !== null) { previousEvent = -1; events.forEach((event, index) => { if (index < selectedEvent && event.tMs >= coverage.fromMs) previousEvent = index; }); }
  const nextEvent = events.findIndex((event, index) => (selectedEvent === null ? event.tMs > time + 50 : index > selectedEvent) && event.tMs <= coverage.toMs && event.tMs >= coverage.fromMs);
  return <>
    {(warning || notice) && <p role="status" className="mb-4 rounded-2xl border border-line bg-surface px-5 py-3 text-sm text-muted">{notice || warning}</p>}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <section aria-label="回放播放器" className="min-w-0 overflow-hidden rounded-3xl border border-line bg-surface">
        <div className="relative aspect-[16/10] min-h-64 bg-[#bfd6d8] sm:aspect-video"><canvas ref={canvas} className="block h-full w-full" aria-label="只读三维回放，不接收游戏移动或射击输入" />
          {(!ready || renderError) && <div role={renderError ? 'alert' : 'status'} className="absolute inset-0 flex items-center justify-center bg-paper/90 p-6 text-center text-muted">{renderError ?? progress}</div>}
          {ready && !renderError && <div className="pointer-events-none absolute left-4 top-4 rounded-xl bg-paper/90 px-3 py-2 text-xs font-semibold text-primary">{playing ? '正在回放' : '已暂停'} · {cameraMode === 'original' ? '原始镜头' : '俯视观察'}</div>}
        </div>
        <div className="p-4 sm:p-5">
          <div className="mb-2 flex justify-between gap-3 text-xs text-muted"><span>{coverage.kind === 'complete' ? '完整录像' : '结尾片段'} · {source === 'local' ? '本机副本' : '云端副本'}</span><span className="font-mono tabular-nums">{replayTimeLabel(time)} / {replayTimeLabel(coverage.toMs)}</span></div>
          <input aria-label="回放时间轴" type="range" min={coverage.fromMs} max={Math.max(coverage.fromMs + 1, coverage.toMs)} step="10" value={time} disabled={!ready || Boolean(renderError)} onChange={event => seek(Number(event.target.value))} className="my-2 h-9 w-full accent-primary" />
          <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2">
            <Button aria-label="上一个关键事件" variant="secondary" disabled={!ready || previousEvent < 0} onClick={() => jump(previousEvent)}><SkipBack size={17} /></Button>
            <Button aria-label={playing ? '暂停回放' : '播放回放'} disabled={!ready || Boolean(renderError)} onClick={() => viewer.current?.play(!playing)}>{playing ? <Pause size={18} /> : <Play size={18} />}{playing ? '暂停' : '播放'}</Button>
            <Button aria-label="下一个关键事件" variant="secondary" disabled={!ready || nextEvent < 0} onClick={() => jump(nextEvent)}><SkipForward size={17} /></Button>
            <button type="button" title="回到片段开头" aria-label="回到片段开头" disabled={!ready} onClick={() => seek(coverage.fromMs)} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted hover:bg-paper"><RotateCcw size={17} /></button>
          </div><label className="flex items-center gap-2 text-sm text-muted">速度<select aria-label="回放速度" value={speed} onChange={event => { setSpeed(event.target.value); viewer.current?.speed(Number(event.target.value)); }} className="min-h-11 rounded-xl border border-line bg-surface px-3 text-ink"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option></select></label></div>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4 text-sm"><label className="flex items-center gap-2">视角<select aria-label="回放视角" value={cameraMode} onChange={event => { const value = event.target.value === 'overhead' ? 'overhead' : 'original'; setCameraMode(value); viewer.current?.camera(value); }} className="min-h-10 rounded-xl border border-line bg-surface px-3"><option value="original">原始镜头</option><option value="overhead">俯视观察</option></select></label>
            <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={scans} onChange={event => { setScans(event.target.checked); viewer.current?.scans(event.target.checked); }} className="accent-primary" />扫描范围</label>
            <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={path} onChange={event => { setPath(event.target.checked); viewer.current?.path(event.target.checked); }} className="accent-primary" />已走过的路线</label></div>
        </div>
      </section>
      <aside className="min-w-0 rounded-3xl border border-line bg-surface p-5"><h2 className="text-lg font-bold">关键时刻</h2><p className="mt-2 text-xs leading-relaxed text-muted">点击跳到事件前两秒。录像之外的事件只显示摘要。</p><ol className="mt-4 max-h-[28rem] space-y-2 overflow-y-auto pr-1">{events.map((event, index) => {
        const outside = event.tMs < coverage.fromMs || event.tMs > coverage.toMs;
        return <li key={event.seq}><button type="button" disabled={!ready || outside} onClick={() => jump(index)} className={`w-full rounded-xl border px-3 py-3 text-left text-sm ${outside ? 'border-transparent text-muted opacity-65' : Math.abs(event.tMs - time) < 500 ? 'border-primary bg-primary/10 text-primary' : 'border-line hover:border-primary/40 hover:bg-paper'}`}><span className="mr-3 font-mono text-xs tabular-nums">{replayTimeLabel(event.tMs)}</span>{eventLabel(event)}{outside && <span className="mt-1 block text-xs">仅摘要 · 不在录像内</span>}</button></li>;
      })}</ol>{events.length === 0 && <p className="mt-5 text-sm text-muted">这段录像没有独立关键事件，仍可拖动查看真实状态。</p>}</aside>
    </div>
    <div className="mt-5 grid gap-3 rounded-2xl border border-line p-5 text-xs leading-relaxed text-muted sm:grid-cols-2"><p>{coverage.kind === 'ending-clip' ? `本局仅保留 ${replayTimeLabel(coverage.fromMs)}–${replayTimeLabel(coverage.toMs)}，更早过程未保留。片段从完整状态开始，不补造首次发现事件。` : '按当局状态记录进行三维复盘。移动采用记录间插值，命中、血量与目标变化按真实事件切换；粒子表现经过简化。'}</p><p>场景：{payload.manifest.world.title} · 规则：{payload.manifest.config.version} · 素材：{payload.manifest.assetVersion}。回放不重新运行战斗，也不会产生新成绩。</p></div>
  </>;
}
