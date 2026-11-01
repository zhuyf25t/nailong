import { lazy, Suspense, useMemo } from 'react';
import { ArrowLeft, ArrowRight, Check, Clock3, Flag, GraduationCap, Shield, Sparkles, Waves } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { StatusPanel } from '../../components/ui/StatusPanel';
import type { GameSettings } from '../../system/settings/GameSettings';
import type { LessonKind } from '../Training/game/core/lesson';
import { PRACTICE_CONFIG } from '../Training/functions/practiceConfig';
import { parseLessonSelection } from './functions/parseLessonSelection';
import { useAcademy } from './hooks/useAcademy';

const GameView = lazy(() => import('../Training/components/GameView'));
const courses = [
  { kind: 'beacon', number: '01', title: '带着信号回来', subtitle: '激活 · 撤离', icon: Flag, description: '穿过练习场，靠近信标按 E，再回到出生点的撤离区。', goal: '激活信标，并进入撤离区。', hint: '信标在前方；激活后沿原路回来。工具可以帮助你通过无人机的扫描。' },
  { kind: 'cover', number: '02', title: '躲进一片安全里', subtitle: '扫描 · 脱离', icon: Shield, description: '先让无人机发现你，然后绕到实体掩体后，真正摆脱它的视线。', goal: '曾被锁定，然后成功脱离扫描。', hint: '先接近前方无人机，看到追击提示后绕到左右墙后，继续拉开距离。' },
  { kind: 'tool', number: '03', title: '恰到好处的小工具', subtitle: '时机 · 生效', icon: Sparkles, description: '按 Q 使用一次工具。让它真实影响扫描、无人机或追击，才算通过。', goal: '工具必须实际影响一架无人机。', hint: '靠近无人机再使用；帘幕挡在视线中，诱饵在未锁定时引开注意，脉冲需要敌机处于附近。' },
] satisfies ReadonlyArray<{ kind: LessonKind; number: string; title: string; subtitle: string; icon: typeof Flag; description: string; goal: string; hint: string }>;
const toolLabels = { none: '不带工具', curtain: '干扰幕', decoy: '诱饵信标', pulse: '排斥脉冲' };

export default function Academy({ settings, suspended, openSettings }: { settings: GameSettings; suspended: boolean; openSettings: () => void }) {
  const [params, setParams] = useSearchParams();
  const selectionState = useMemo(() => { try { return { kind: 'ready', value: parseLessonSelection(params) } as const; } catch (error) { return { kind: 'error', message: error instanceof Error ? error.message : '课堂参数无效' } as const; } }, [params]);
  const academy = useAcademy();
  if (selectionState.kind === 'error') return <StatusPanel title="这节课的地址有点不对"><p>{selectionState.message}</p><Button onClick={() => setParams({ lesson: 'beacon', tool: 'curtain' })}>返回课堂列表</Button></StatusPanel>;
  const selection = selectionState.value;
  const selectedCourse = courses.find(course => course.kind === (academy.active?.options.kind ?? selection.kind)) ?? courses[0];
  const completed = academy.progress.status === 'complete';
  const elapsed = Math.min(30, Math.max(0, academy.progress.elapsedSeconds));

  return <main className={`mx-auto px-4 pb-8 sm:px-8 ${academy.active ? 'max-w-[1600px]' : 'max-w-6xl'}`}>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><Link to="/missions" className="flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-primary"><ArrowLeft size={17} />任务地图</Link><span className="rounded-full bg-primary/5 px-4 py-2 text-xs text-muted">公开练习 · 不创建局次，不保存成绩</span></div>
    {academy.active ? <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-[10px] font-semibold tracking-[.2em] text-primary">FIELD ACADEMY / {selectedCourse.number}</p><h1 className="text-2xl font-bold sm:text-3xl">{selectedCourse.title}</h1><p className="mt-2 max-w-2xl text-xs leading-6 text-muted">{selectedCourse.goal} {selectedCourse.hint}</p></div><div className="flex gap-2"><Button variant="ghost" onClick={openSettings}>设置</Button><Button variant="secondary" onClick={academy.exit}>回课堂列表</Button></div></div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-5 py-3 text-xs"><span className="flex items-center gap-2"><Clock3 size={16} />{!academy.ready ? '正在准备练习场…' : academy.progress.status === 'ready' ? '场景准备好了，按下画面中的开始' : `已练习 ${elapsed.toFixed(1)} / 30 秒`}</span><span className="text-muted" aria-live="polite">{academy.active.options.kind === 'tool' ? `携带${toolLabels[academy.active.setup.loadout.tool]} · ${academy.progress.toolEffective ? '已经真实生效' : academy.progress.toolUsed ? '已使用，尚未产生效果' : '还没有使用'}` : academy.active.options.kind === 'cover' ? academy.progress.escapedDetection ? '已摆脱扫描' : '等待成功脱离锁定' : academy.progress.beaconActivated ? '信标已激活，回到撤离区' : '找到信标并按 E'}</span></div>
      <div className="h-[calc(100dvh-275px)] min-h-[400px] overflow-hidden rounded-[26px] border border-line bg-[#cddcbb]">
        <Suspense fallback={<StatusPanel title="正在展开练习场…" busy />}><GameView key={academy.active.key} config={PRACTICE_CONFIG} terrain={academy.active.setup.world.terrain} setup={academy.active.setup} lesson={academy.active.options} settings={settings} practice suspended={suspended || !!academy.result} onReady={academy.onReady} onLessonProgress={academy.onProgress} onFinish={academy.finish} onExit={academy.exit} /></Suspense>
      </div>
    </> : <>
      <section className="mb-8 grid gap-5 border-b border-line pb-8 pt-2 sm:grid-cols-[1fr_auto] sm:items-end"><div><span className="mb-4 flex items-center gap-2 text-xs font-semibold tracking-[.18em] text-primary"><GraduationCap size={18} /> FIELD ACADEMY</span><h1 className="text-3xl font-black tracking-tight sm:text-4xl">先学一招，再去冒险。</h1><p className="mt-4 max-w-xl text-sm leading-7 text-muted">每节小课只有 30 秒。你亲自移动、躲藏和操作，练习场会按实际发生的事情判断是否达标。</p></div><p className="flex items-center gap-2 text-xs text-muted"><Clock3 size={16} />只在行动中计时，暂停也能慢慢想</p></section>
      <div className="grid gap-4 md:grid-cols-3">{courses.map(course => <button key={course.kind} onClick={() => setParams({ lesson: course.kind, tool: selection.tool === 'none' ? 'curtain' : selection.tool })} aria-pressed={selection.kind === course.kind} className={`min-h-64 rounded-3xl border p-6 text-left transition-colors ${selection.kind === course.kind ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-line bg-surface hover:border-primary/40'}`}><span className="mb-6 flex items-center justify-between"><span className="flex size-12 items-center justify-center rounded-2xl bg-amber/20 text-primary"><course.icon size={24} /></span><span className="text-xs font-semibold tracking-widest text-muted">{course.number} / 30 SEC</span></span><span className="text-[10px] font-semibold tracking-[.15em] text-primary">{course.subtitle}</span><h2 className="mt-2 text-xl font-bold">{course.title}</h2><p className="mt-3 text-sm leading-7 text-muted">{course.description}</p><span className="mt-4 flex items-center gap-2 text-xs font-semibold text-primary">{selection.kind === course.kind ? <><Check size={15} />已选择</> : <>选择这节课<ArrowRight size={15} /></>}</span></button>)}</div>
      <section className="mt-6 flex flex-col gap-5 rounded-3xl border border-line bg-surface p-6 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="flex items-center gap-2 font-semibold"><Waves size={18} />这次带什么？</h2>{selection.kind === 'cover' ? <p className="mt-2 text-sm text-muted">掩体课不携带工具，专心体验地形如何遮挡视线。</p> : <div className="mt-3 flex flex-wrap gap-2">{(['curtain', 'decoy', 'pulse'] as const).map(tool => <button key={tool} aria-pressed={selection.tool === tool} onClick={() => setParams({ lesson: selection.kind, tool })} className={`min-h-11 rounded-xl border px-4 text-sm ${selection.tool === tool ? 'border-primary bg-primary text-white' : 'border-line text-muted hover:text-primary'}`}>{toolLabels[tool]}</button>)}</div>}</div><Button className="min-h-14 px-7" onClick={() => academy.start(selection)}>进入 30 秒练习<ArrowRight size={18} /></Button></section>
      <p className="mt-5 text-center text-xs leading-6 text-muted">使用同一套移动、扫描、碰撞与工具机制。课程地图只为学习缩短了路线；正式任务仍以出发时的规则为准。</p>
    </>}
    {academy.result && <Modal open onOpenChange={() => {}} closeable={false} title={completed ? '这一招，你学会了！' : academy.progress.status === 'timeout' ? '30 秒到了，再试一次？' : '先站起来，再练一回'} description={completed ? selectedCourse.goal : '这次没有达到课程目标。看看提示，再找一个更好的时机。'}>
      <div className="rounded-2xl bg-paper p-5"><p className="text-sm leading-7">{selectedCourse.hint}</p><div className="mt-4 flex gap-6 border-t border-line pt-4 text-xs text-muted"><span>实际练习 <strong className="ml-1 text-ink">{elapsed.toFixed(1)} 秒</strong></span><span>本次命中 <strong className="ml-1 text-ink">{academy.result.hits}</strong></span></div></div><p className="my-5 text-xs text-muted">课堂练习不保存账号成绩，不影响正式行动记录。</p><div className="grid grid-cols-2 gap-3"><Button onClick={academy.restart}>再练一次</Button><Button variant="secondary" onClick={academy.exit}>换一节课</Button></div><Link to="/missions/forest-beacon/loadout" className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-primary">准备正式出发<ArrowRight size={16} /></Link>
    </Modal>}
  </main>;
}
