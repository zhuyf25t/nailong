import { ArrowLeft, ArrowRight, Check, Crosshair, Flag, MapPinned, ShieldAlert, Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button.tsx';
import { StatusPanel } from '../../components/ui/StatusPanel.tsx';
import type { ToolKind } from '../../objects/training/ToolKind.ts';
import { WorldPreview } from '../Missions/components/WorldPreview.tsx';
import { ToolCard } from './components/ToolCard.tsx';
import { defaultTool, parseLoadoutLocation, toolAllowed, toolSelectionSearch, trainingPath } from './functions/selection.ts';
import { toolDescriptions } from './functions/toolDescriptions.ts';
import { useLoadout } from './hooks/useLoadout.ts';

export default function Loadout({ enter }: { enter: (path: string) => void }) {
  const { missionId } = useParams<{ missionId: string }>();
  const location = useLocation();
  const [, setSearchParams] = useSearchParams();
  const selection = useMemo(() => parseLoadoutLocation(missionId, location.search), [missionId, location.search]);
  const { state, retry } = useLoadout(selection);
  const selected = state.kind === 'ready' && selection.kind === 'valid' ? selection.requestedTool ?? defaultTool(state.mission) : 'none';
  const description = toolDescriptions.find(tool => tool.kind === selected);
  const hasGate = state.kind === 'ready' && state.map.world.objects.some(object => object.kind === 'gate');
  const canEnter = state.kind === 'ready' && selection.kind === 'valid' && toolAllowed(state.mission, selected);
  const choose = (tool: ToolKind) => { setSearchParams(toolSelectionSearch(location.search, tool), { replace: true }); };
  const start = () => { if (canEnter && selection.kind === 'valid') enter(trainingPath(selection, selected)); };

  return <main className="mx-auto w-full max-w-6xl px-5 pb-14 pt-5 sm:px-8 sm:pt-8">
    <Link to="/missions" className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-primary hover:underline"><ArrowLeft size={17} aria-hidden />重新选择任务</Link>
    <div className="mb-8 flex flex-wrap items-center gap-3 text-xs font-semibold text-muted"><span className="flex items-center gap-1.5"><Check size={14} className="text-primary" aria-hidden />选择任务</span><span aria-hidden>/</span><span aria-current="step" className="rounded-full bg-primary/10 px-3 py-1.5 text-primary">02 准备工具</span><span aria-hidden>/</span><span>03 出发</span></div>
    {selection.kind === 'invalid' ? <StatusPanel title="准备地址有一点问题"><p>{selection.message}</p><Link className="inline-flex min-h-12 items-center rounded-2xl bg-primary px-5 font-semibold text-white" to="/missions">返回任务地图</Link></StatusPanel> : state.kind === 'loading' ? <StatusPanel title="正在准备你的行装…" busy><p>读取任务条件与地图版本。</p></StatusPanel> : state.kind === 'auth-required' ? <StatusPanel title="登录后查看这张地图"><p>这次行动使用账号下的地图版本。登录后会回到这里，继续准备。</p><Button onClick={() => enter(location.pathname + location.search)}>登录并继续</Button></StatusPanel> : state.kind === 'not-found' ? <StatusPanel title="没有找到这次行动"><p>{state.message}</p><Link className="inline-flex min-h-12 items-center rounded-2xl border border-line px-5 font-semibold text-primary" to="/missions">选择其他任务</Link></StatusPanel> : state.kind === 'failed' ? <StatusPanel title="行装还没有准备好"><p>任务或地图暂时没有读取成功。请检查连接后重试。</p><Button onClick={retry}>重新读取</Button></StatusPanel> : <>
      <div className="mb-8"><p className="mb-3 text-xs font-semibold tracking-[.2em] text-muted">BEFORE YOU GO / 出发准备</p><h1 tabIndex={-1} className="text-3xl font-bold tracking-tight sm:text-4xl">{state.mission.title}</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-muted sm:text-base">{state.mission.objective.kind === 'activate_extract' ? '先想好进去的路，也留好回来的路。带一件工具，把机会留给最需要的时刻。' : '观察扫描方向，逐个消除威胁。带一件工具，为走位多留一个选择。'}</p></div>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
        <aside className="space-y-5 lg:sticky lg:top-6">
          <WorldPreview world={state.map.world} beaconObjective={state.mission.objective.kind === 'activate_extract'} label={`${state.map.title}版本 ${state.map.version} 的实际地图预览`} />
          <section className="rounded-2xl border border-line bg-surface p-5"><h2 className="flex items-center gap-2 font-bold"><Flag size={18} className="text-primary" aria-hidden />这次要做的事</h2>{state.mission.objective.kind === 'activate_extract' ? <ol className="mt-4 space-y-3 text-sm leading-6 text-ink"><li className="flex gap-3"><span className="text-primary">01</span><span>绕过扫描或清除挡路无人机，抵达信标。</span></li><li className="flex gap-3"><span className="text-primary">02</span><span>靠近后按 <kbd className="rounded border border-line bg-paper px-1.5 font-sans">E</kbd> 或触屏交互，启动信标{hasGate ? '、打开捷径门' : ''}。</span></li><li className="flex gap-3"><span className="text-primary">03</span><span>回到撤离区域，即可完成任务。无需击毁全部无人机。</span></li></ol> : <p className="mt-4 text-sm leading-7">击毁地图中的全部 <strong>{state.map.world.drones.length} 架无人机</strong>。小心受击后加速搜索的敌机，换位射击可以降低被发现的风险。</p>}<p className="mt-5 flex gap-2 border-t border-line pt-4 text-xs leading-6 text-muted"><ShieldAlert size={16} className="mt-1 shrink-0" aria-hidden />被无人机接触会爆炸并结束本局；没有硬性倒计时。</p></section>
          <p className="flex items-center gap-2 px-1 text-xs text-muted"><MapPinned size={15} aria-hidden />{state.map.title} · 版本 {state.map.version}{!state.map.builtIn && ' · 我的地图'}</p>
        </aside>
        <section aria-label="选择随身工具">
          <fieldset><legend className="text-xl font-bold">给自己留一个办法</legend><p className="mb-5 mt-2 text-sm leading-6 text-muted">每局最多携带一件工具，使用一次。按 <kbd className="rounded border border-line bg-surface px-1.5 font-sans">Q</kbd> 或触屏工具按钮释放。</p><div className="grid gap-3">{toolDescriptions.map(tool => <ToolCard key={tool.kind} tool={tool} selected={selected === tool.kind} allowed={toolAllowed(state.mission, tool.kind)} choose={choose} />)}</div></fieldset>
          {!canEnter && <p role="alert" className="mt-4 rounded-xl bg-danger/8 p-4 text-sm text-danger">链接里选择的工具不适用于本任务，请重新选择一个可用工具。</p>}
          {description && <div className="mt-5 rounded-2xl bg-amber/15 p-5"><p className="flex items-center gap-2 text-sm font-semibold text-ink"><Sparkles size={16} aria-hidden />{description.name}，怎么用更合适</p><p className="mt-2 text-sm leading-6 text-muted">{description.constraint}</p>{selected !== 'none' && canEnter ? <Link to={`/academy?lesson=tool&tool=${selected}`} className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline underline-offset-4">先试用这件工具<ArrowRight size={16} aria-hidden /></Link> : <p className="mt-3 flex items-center gap-2 text-xs text-muted"><Crosshair size={14} aria-hidden />脉冲枪不占工具位置，始终可以使用。</p>}</div>}
          <div className="mt-6 border-t border-line pt-6"><Button className="min-h-14 w-full text-base" disabled={!canEnter} onClick={start}>准备好了，正式出发<ArrowRight size={19} aria-hidden /></Button><p className="mt-3 text-center text-xs leading-6 text-muted">正式行动会保存到账号。工具试用无需登录，不写入挑战成绩。</p></div>
        </section>
      </div>
    </>}
  </main>;
}
