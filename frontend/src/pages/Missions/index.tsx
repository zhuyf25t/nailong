import { ArrowLeft, BookOpen, Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button.tsx';
import { StatusPanel } from '../../components/ui/StatusPanel.tsx';
import { MissionCard } from './components/MissionCard.tsx';
import { useMissions } from './hooks/useMissions.ts';

export default function Missions() {
  const { state, retry } = useMissions();
  return <main className="mx-auto w-full max-w-6xl px-5 pb-14 pt-5 sm:px-8 sm:pt-8">
    <Link to="/" className="mb-7 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-primary hover:underline"><ArrowLeft size={17} aria-hidden />返回营地</Link>
    <div className="flex flex-wrap items-end justify-between gap-6"><div><p className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-[.2em] text-muted"><Compass size={15} aria-hidden />FIELD GUIDE / 任务地图</p><h1 tabIndex={-1} className="text-3xl font-bold tracking-tight sm:text-5xl">今天，向哪边出发？</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-muted sm:text-base">同一片花谷，两种冒险。先选这次的目标，再带上一件适合你的工具。</p></div><Link to="/academy" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-semibold text-primary hover:bg-surface"><BookOpen size={17} aria-hidden />先去训练课堂</Link></div>
    {state.kind === 'ready' && <section aria-label="可选择的任务" className="mt-9 grid gap-6 md:grid-cols-2">{state.missions.map(mission => <MissionCard key={mission.id} mission={mission} />)}</section>}
    {state.kind === 'loading' && <StatusPanel title="正在展开行动地图…" busy><p>读取当前可用的任务。</p></StatusPanel>}
    {state.kind === 'empty' && <StatusPanel title="暂时没有可出发的任务"><p>任务清单目前为空，稍后再来看看。</p><Button variant="secondary" onClick={retry}>刷新任务</Button></StatusPanel>}
    {state.kind === 'failed' && <StatusPanel title="任务地图暂时没有读到"><p>请检查连接后重试。公开任务无需登录即可查看。</p><Button onClick={retry}>重新读取</Button></StatusPanel>}
    <p className="mt-7 text-center text-xs leading-6 text-muted">查看任务与试用工具不需要账号。正式出发时登录，行动结果就会留在你的手记里。</p>
  </main>;
}
