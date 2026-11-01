import { ArrowUpRight, Crosshair, Route, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { MissionDefinition } from '../../../objects/training/MissionDefinition.ts';
import { builtinMaps } from '../../../objects/training/builtinCatalog.ts';
import { WorldPreview } from './WorldPreview.tsx';

export function MissionCard({ mission }: { mission: MissionDefinition }) {
  const beacon = mission.objective.kind === 'activate_extract';
  const map = builtinMaps.find(item => item.id === mission.mapVersionId);
  return <article className={`flex flex-col overflow-hidden rounded-[28px] border bg-surface ${beacon ? 'border-primary/40' : 'border-line'}`}>
    <div className="flex items-center justify-between gap-4 px-6 pb-4 pt-6"><span className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted">{beacon ? <Route size={17} aria-hidden /> : <Crosshair size={17} aria-hidden />}{beacon ? '观察 · 潜入 · 撤离' : '换位 · 射击 · 清场'}</span>{beacon && <span className="rounded-full bg-amber/25 px-3 py-1 text-xs font-semibold text-ink">从这里出发</span>}</div>
    <div className="px-5">{map ? <WorldPreview world={map.world} beaconObjective={beacon} label={`${mission.title}，来自当前关卡配置的地图预览`} /> : <div className="flex aspect-[6/5] items-center justify-center rounded-2xl bg-paper p-6 text-center text-sm text-muted">地图预览暂不可用，任务条件仍可查看。</div>}</div>
    <div className="flex flex-1 flex-col px-6 pb-6 pt-5"><h2 className="text-2xl font-bold tracking-tight text-ink">{mission.title}</h2><p className="mt-3 min-h-12 text-sm leading-6 text-muted">{mission.description}</p><div className="mt-5 flex flex-wrap gap-2 text-xs"><span className="rounded-lg bg-primary/8 px-3 py-2 text-primary">{beacon ? '启动信标，再回到撤离点' : `击毁${map ? `全部 ${map.world.drones.length} 架` : '全部'}无人机`}</span><span className="rounded-lg bg-paper px-3 py-2 text-muted">{beacon ? '不要求全清' : '清除全部才完成'}</span></div><p className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted"><ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden />两种任务都会遭到扫描与追击；被无人机碰到即失败。</p><Link className={`mt-6 inline-flex min-h-12 items-center justify-between rounded-2xl px-5 text-sm font-semibold ${beacon ? 'bg-primary text-white hover:bg-primary-hover' : 'border border-line text-ink hover:bg-paper'}`} to={`/missions/${mission.id}/loadout`}>查看任务，选择工具<ArrowUpRight size={18} aria-hidden /></Link></div>
  </article>;
}
