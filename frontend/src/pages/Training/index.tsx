import { lazy, Suspense, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CloudUpload, LoaderCircle, Settings, Shield, Trophy } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { StatusPanel } from '../../components/ui/StatusPanel';
import type { GameSettings } from '../../system/settings/GameSettings';
import { useSession } from '../../system/session/SessionProvider';
import { ResultSummary } from '../Result/components/ResultSummary';
import { TerrainControls } from './components/TerrainControls';
import { useTraining } from './hooks/useTraining';

const GameView = lazy(() => import('./components/GameView'));
export default function Training({ settings, suspended, openSettings, requestLogin }: { settings: GameSettings; suspended: boolean; openSettings: () => void; requestLogin: () => void }) {
  const [params] = useSearchParams();
  const session = useSession();
  const practice = params.get('practice') === '1';
  const game = useTraining(practice, params.toString());
  const navigate = useNavigate();
  const [exitOpen, setExitOpen] = useState(false);
  const [unmanagedExit, setUnmanagedExit] = useState<'again' | 'home' | 'details' | null>(null);
  const setup = game.active?.setup ?? (game.preparation.kind === 'ready' ? game.preparation.setup : undefined);
  const extraction = setup?.mission.objective.kind === 'activate_extract';
  const performFinishAction = (action: 'again' | 'home' | 'details') => {
    setUnmanagedExit(null);
    if (action === 'again') game.again();
    else if (action === 'details' && game.active?.run) navigate(`/results/${game.active.run.id}`);
    else navigate('/');
  };
  const requestFinishAction = (action: 'again' | 'home' | 'details') => {
    if (game.recordingPending) return;
    if (!practice && game.finished && !game.resultHandedOff) setUnmanagedExit(action);
    else performFinishAction(action);
  };
  const exit = async () => { if (game.finished) requestFinishAction('home'); else if (await game.abandon()) navigate('/'); };
  return <main className="mx-auto flex min-h-dvh max-w-[1600px] flex-col px-3 pb-3 sm:px-6">
    <header className="flex min-h-20 items-center justify-between gap-3"><button className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold" onClick={() => game.finished ? requestFinishAction('home') : game.active ? setExitOpen(true) : navigate('/')}><ArrowLeft size={18} />主菜单</button><span className="hidden text-xs tracking-wider text-muted sm:block">{practice ? '自由练习 · 不保存成绩' : '花谷巡猎 · 正式挑战'}</span><div className="flex gap-2">{!practice && session.state.kind !== 'signed-in' && <Button variant="secondary" onClick={requestLogin}>重新登录</Button>}<Button variant="ghost" onClick={openSettings}><Settings size={18} /><span className="hidden sm:inline">设置</span></Button></div></header>
    {game.active ? <div className="h-[calc(100dvh-92px)] min-h-[360px] shrink-0 overflow-hidden rounded-[26px] border border-line bg-[#d6e6bf]">
      <Suspense fallback={<StatusPanel title="正在展开花谷…" busy>正在加载游戏引擎与场景。</StatusPanel>}><GameView key={game.active.key} config={game.active.config} terrain={game.active.terrain} setup={game.active.setup} runId={game.active.run?.id ?? null} settings={settings} practice={practice} suspended={suspended || exitOpen || !!game.finished} onRecording={practice ? undefined : game.receiveRecording} onRecordingError={game.setRecordingError} onFinish={game.finish} onExit={() => setExitOpen(true)} /></Suspense>
    </div> : game.preparation.kind === 'loading' ? <StatusPanel title="正在准备你的花谷" busy>正在获取最新行动规则。</StatusPanel> : game.preparation.kind === 'error' ? <StatusPanel title="花谷暂时没有准备好"><p>{game.preparation.message}</p><Button onClick={game.reload}>重新准备</Button></StatusPanel> : <section className="grid flex-1 overflow-hidden rounded-[28px] border border-line bg-surface lg:grid-cols-[1.25fr_1fr]">
      <div className="relative min-h-64 overflow-hidden bg-[#afcaa0]"><img src="/art/game-preview.png" alt="花谷内的无人机、红色扫描范围与木箱掩体。" className="absolute left-0 top-[-14%] h-[128%] w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-ink/70 to-transparent" /><div className="absolute bottom-8 left-8 right-8 text-white"><p className="text-xs tracking-[.2em]">FIELD NOTES / 01</p><h1 className="mt-3 text-3xl font-bold">{extraction ? <>点亮林间的光，<br />带着勇气平安归来。</> : <>穿过层层掩体，<br />让花谷恢复宁静。</>}</h1></div></div>
      <div className="flex flex-col justify-center space-y-5 p-6 lg:p-10"><span className="text-xs font-semibold tracking-[.16em] text-primary">{practice ? 'PRACTICE · 自由练习' : 'READY WHEN YOU ARE'}</span><h2 className="text-3xl font-bold">准备出发了吗？</h2><p className="text-sm leading-7 text-muted">靠近掩体，留意红光。未发现你的无人机受击后会加速搜索；一旦锁定，即使受击也会继续追来。接触爆炸会结束本局。</p><div className="flex gap-6 border-y border-line py-5"><span><strong className="block text-2xl">{setup?.world.drones.length ?? game.preparation.config.drones.spawns.length}</strong><span className="text-xs text-muted">架巡逻无人机</span></span><span><strong className="block text-2xl">{game.preparation.config.drones.maxHp}</strong><span className="text-xs text-muted">次命中击毁一架</span></span><span><strong className="block text-2xl">{game.preparation.config.drones.scanFovDegrees}°</strong><span className="text-xs text-muted">留意扫描视野</span></span></div>
        {setup ? <div className="rounded-2xl border border-line bg-paper p-4"><p className="font-semibold">{setup.mission.title} · {setup.world.title}</p><p className="mt-2 text-sm leading-6 text-muted">{extraction ? '从左右侧入口进入，靠近信标按 E 启动，沿打开的捷径返回撤离点。无人机不必全部击毁。' : '利用真实掩体分区推进，击毁全部无人机完成任务。'}</p><p className="mt-2 text-xs text-primary">携带：{setup.loadout.tool === 'curtain' ? '干扰幕 · 阻断视线后换方向' : setup.loadout.tool === 'decoy' ? '诱饵信标 · 引开尚未锁定的无人机' : setup.loadout.tool === 'pulse' ? '排斥脉冲 · 争取近身脱离空间' : '不携带工具'}{setup.loadout.tool !== 'none' && ' · Q 键使用一次'}</p></div> : <TerrainControls terrain={game.preparation.terrain} onChange={game.setTerrain} disabled={game.busy} />}
        {game.error && <p role="alert" className="rounded-xl bg-danger/5 p-3 text-sm text-danger">{game.error} <button className="underline" onClick={game.reload}>重新获取规则</button></p>}
        <Button className="min-h-14 justify-between text-base" disabled={game.busy} onClick={() => void game.start()}>{game.busy ? <><LoaderCircle className="animate-spin" size={18} />正在创建行动…</> : <>{practice ? '进入自由练习' : '进入挑战'}<ArrowRight size={20} /></>}</Button><p className="text-center text-xs text-muted">{practice ? '无需账号 · 不会写入个人记录' : '加载完成后由你按下开始，成绩会保存到当前账号。'}</p>
      </div>
    </section>}
    <Modal open={exitOpen} onOpenChange={setExitOpen} title="先回花园休息一下？" description={practice ? '自由练习不保存成绩，随时可以再回来。' : '这次未完成的挑战会标记为放弃，不会生成成绩。'}>
      {game.error && <p role="alert" className="mb-4 text-sm text-danger">{game.error}</p>}<div className="flex flex-wrap gap-3"><Button autoFocus onClick={() => setExitOpen(false)} disabled={game.busy}>继续行动</Button><Button variant="secondary" onClick={() => void exit()} disabled={game.busy}>{game.busy ? '正在离开…' : '确认回主菜单'}</Button>{!practice && game.error && <Button variant="ghost" onClick={requestLogin}>使用原账号重新登录</Button>}</div>
    </Modal>
    {game.finished && <Modal open title={<span className="flex items-center gap-3">{game.finished.outcome === 'victory' ? <Trophy className="shrink-0 text-primary" size={26} /> : <Shield className="shrink-0 text-danger" size={26} />}{game.finished.outcome === 'victory' ? extraction ? '信标亮起，平安归来！' : '花谷安全啦！' : '被无人机追上了'}</span>} onOpenChange={() => {}} closeable={false} description={game.finished.outcome === 'victory' ? extraction ? '信标已启动，已经返回撤离点；这局目标完成。' : '全部无人机已经击落，这次守护任务完成。' : '下次试着绕过红光，利用真实掩体和工具改变路线。'}>
      <ResultSummary submission={game.finished} totalDrones={setup?.world.drones.length ?? game.active?.config.drones.spawns.length} showHeading={false} />
      <div className="my-5 rounded-2xl bg-paper p-4 text-sm leading-6" aria-live="polite">
        {practice ? <p className="text-muted">自由练习成绩，仅本次展示，不写入个人记录。</p> : game.saveState?.status === 'saved' ? <p className="flex items-center gap-2 text-primary"><Check size={17} />已记入你的挑战记录</p> : game.saveState?.status === 'saving' ? <p className="flex items-center gap-2 text-muted"><LoaderCircle className="animate-spin" size={17} />正在保存本局…</p> : <div><p className="flex items-center gap-2 text-danger"><CloudUpload size={17} />本局尚未保存</p><p className="mt-1 text-xs text-muted">{game.saveState?.status === 'failed' ? game.saveState.message : '请重试；开始下一局也不会清除待保存结果。'}</p><div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" onClick={game.retrySave}>重试保存</Button><Button variant="ghost" onClick={requestLogin}>使用原账号登录</Button></div></div>}
        {game.storageWarning && <p role="alert" className="mt-2 text-xs text-danger">{game.storageWarning}</p>}{game.error && <p role="alert" className="mt-2 text-xs text-danger">{game.error}</p>}
        {!practice && setup && <div className="mt-3 border-t border-line pt-3"><p className="text-xs text-muted">{game.recordingPending ? '正在将真实过程暂存到本机…' : game.replayState?.replay.status === 'saved' && game.replayState.events.status === 'saved' ? '真实回放与事件已保存' : game.replayState?.durable === false ? '回放仅保留在本页面内存，尚未持久化；请保留页面并重试保存。' : game.replayState ? game.replayState.replay.status === 'uploading' ? '成绩独立保存 · 回放上传中…' : game.replayState.replay.message ?? '回放已暂存，正在等待成绩保存后补传。' : game.recordingError ? '本局回放未保存，成绩不受影响。' : '正在整理过程记录…'}</p>{(game.recordingError || game.replayStorageWarning) && <p className="mt-2 text-xs text-danger">{game.recordingError ?? game.replayStorageWarning}</p>}{(game.canRetryRecording && (game.recordingError || game.replayState?.replay.status === 'pending')) && <button className="mt-1 min-h-10 text-xs font-semibold text-primary underline" disabled={game.recordingPending} onClick={() => void game.retryRecording()}>重试回放保存</button>}</div>}
      </div>
      <div className="grid grid-cols-2 gap-3"><Button disabled={game.recordingPending} onClick={() => requestFinishAction('again')}>再来一局<ArrowRight size={17} /></Button><Button disabled={game.recordingPending} variant="secondary" onClick={() => requestFinishAction('home')}>回主菜单</Button></div>
      {game.active?.run && <button className="mt-4 block min-h-11 w-full rounded-lg py-3 text-center text-xs text-muted underline underline-offset-4" onClick={() => requestFinishAction('details')}>查看本局详情</button>}
    </Modal>}
    <Modal open={unmanagedExit !== null} onOpenChange={open => { if (!open) setUnmanagedExit(null); }} title="这份结果还没有暂存成功" description="当前结果只保留在这个结算页面。离开会丢失它；建议先留在这里重试保存。">
      <div className="space-y-3"><Button autoFocus className="w-full" onClick={() => { setUnmanagedExit(null); game.retrySave(); }}>留下并重试保存</Button><Button variant="danger" className="w-full" onClick={() => { if (unmanagedExit) performFinishAction(unmanagedExit); }}>放弃这份结果并继续</Button></div>
    </Modal>
  </main>;
}
