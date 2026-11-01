import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Copy, Layers3, Leaf, LoaderCircle, Map, PencilLine, Play, RefreshCw } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { ListMyMapsAPI } from '../../apis/worlds/ListMyMapsAPI';
import { CloneMapAPI } from '../../apis/worlds/CloneMapAPI';
import type { MapVersion } from '../../objects/worlds/MapVersion';
import type { MapSummary } from '../../objects/worlds/MapSummary';
import { useSession } from '../../system/session/SessionProvider';
import { Button } from '../../components/ui/Button';
import { WorldCanvas } from '../MapEditor/components/WorldCanvas';

export default function Workshop() {
  const { state: session } = useSession(), navigate = useNavigate();
  const token = session.kind === 'signed-in' ? session.token : null;
  const [templates, setTemplates] = useState<MapVersion[]>([]), [maps, setMaps] = useState<MapSummary[]>([]);
  const [total, setTotal] = useState(0), [loading, setLoading] = useState(true), [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null), [cloneBusy, setCloneBusy] = useState<string | null>(null), [reload, setReload] = useState(0);
  const generation = useRef(0), loadLock = useRef(false), cloneLock = useRef(false);
  useEffect(() => {
    const controller = new AbortController(), request = ++generation.current;
    setMaps([]); setTemplates([]); setTotal(0); setLoading(true); setError(null); setMore(false); setCloneBusy(null); loadLock.current = false; cloneLock.current = false;
    if (!token) { setLoading(false); setError('登录后可以管理和保存自己的地图。'); return; }
    new ListMyMapsAPI({ offset: 0, limit: 8 }).send({ token, signal: controller.signal }).then(value => {
      if (request !== generation.current || controller.signal.aborted) return;
      setMaps([...value.maps]); setTemplates([...value.templates]); setTotal(value.total); setLoading(false);
    }).catch(reason => { if (!controller.signal.aborted && request === generation.current) { setError(reason instanceof Error ? reason.message : '工坊暂时无法连接。'); setLoading(false); } });
    return () => { controller.abort(); generation.current++; };
  }, [token, reload]);
  const loadMore = async () => {
    if (!token || loadLock.current) return;
    loadLock.current = true; setMore(true); setError(null); const request = generation.current;
    try { const value = await new ListMyMapsAPI({ offset: maps.length, limit: 8 }).send({ token }); if (request === generation.current) { setMaps(current => [...current, ...value.maps.filter(item => !current.some(old => old.mapId === item.mapId))]); setTotal(value.total); } }
    catch (reason) { if (request === generation.current) setError(reason instanceof Error ? reason.message : '更多地图暂时无法读取。'); }
    finally { if (request === generation.current) { setMore(false); loadLock.current = false; } }
  };
  const clone = async (version: MapVersion) => {
    if (!token || cloneLock.current) return;
    cloneLock.current = true; setCloneBusy(version.id); setError(null); const request = generation.current;
    try { const draft = await new CloneMapAPI(version.id).send({ token }); if (request === generation.current) navigate(`/workshop/maps/${draft.mapId}/edit`); }
    catch (reason) { if (request === generation.current) setError(reason instanceof Error ? reason.message : '复制没有成功，请重试。'); }
    finally { if (request === generation.current) { setCloneBusy(null); cloneLock.current = false; } }
  };
  return <main className="mx-auto max-w-7xl px-5 pb-14 pt-6 sm:px-8">
    <Link to="/" className="mb-8 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft size={17} />回到营地</Link>
    <header className="mb-9 flex flex-wrap items-end justify-between gap-5"><div><p className="mb-3 text-[10px] font-semibold tracking-[.24em] text-primary">MAKE A LITTLE WORLD</p><h1 className="text-3xl font-black tracking-tight sm:text-4xl">把你的想法，变成一片花谷。</h1><p className="mt-4 max-w-xl text-sm leading-7 text-muted">摆一道墙，换一条巡逻路线。先亲自走一遍，再把这份地图留下来。</p></div><span className="flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-xs text-muted"><Leaf size={15} />只属于你的创作工坊</span></header>
    {error && <div role="alert" className="mb-7 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger"><p>{error}</p><Button variant="ghost" onClick={() => setReload(n => n + 1)}><RefreshCw size={15} />重新连接</Button></div>}
    <section aria-labelledby="workshop-templates"><div className="mb-5 flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-xl bg-amber/20 text-primary"><Map size={18} /></span><div><h2 id="workshop-templates" className="text-xl font-bold">从一张好玩的地图开始</h2><p className="mt-1 text-xs text-muted">模板可以直接试玩；复制之后，才会成为可编辑的个人草稿。</p></div></div>
      {loading ? <div role="status" className="grid gap-5 sm:grid-cols-2">{[0, 1].map(v => <div key={v} className="h-72 animate-pulse rounded-[26px] bg-line/35" />)}<span className="sr-only">正在读取地图模板</span></div> : templates.length ? <div className="grid gap-5 lg:grid-cols-2">{templates.map((version, index) => <article key={version.id} className="grid overflow-hidden rounded-[26px] border border-line bg-surface sm:grid-cols-[.95fr_1.05fr]"><div className="relative overflow-hidden border-b border-line bg-[#e8eddc] sm:border-b-0 sm:border-r"><WorldCanvas world={version.world} compact /><span className="absolute left-4 top-4 rounded-full bg-surface/95 px-3 py-1 text-[10px] tracking-widest text-muted">FIELD {String(index + 1).padStart(2, '0')}</span></div><div className="flex flex-col p-6"><p className="text-[10px] tracking-[.17em] text-primary">花谷模板 · v{version.version}</p><h3 className="mt-3 text-2xl font-bold">{version.title}</h3><p className="mt-3 text-sm leading-7 text-muted">{version.world.drones.length} 架无人机 · {version.world.objects.length} 处掩体<br />{version.world.bounds.halfSize * 2} 米见方的战场</p><div className="mt-auto space-y-2 pt-6"><Button className="w-full" disabled={cloneBusy !== null} onClick={() => void clone(version)}>{cloneBusy === version.id ? <LoaderCircle size={16} className="animate-spin" /> : <Copy size={16} />}复制并改造<ArrowRight size={16} /></Button><Link to={`/training?practice=1&mission=forest-beacon&tool=curtain&mapVersionId=${version.id}`} className="flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-primary hover:bg-primary/5"><Play size={15} />先试玩这张图</Link></div></div></article>)}</div> : <p className="rounded-2xl border border-line p-6 text-sm text-muted">暂时没有可用模板，请稍后重新连接。</p>}
    </section>
    <section className="mt-11" aria-labelledby="workshop-my-maps"><div className="mb-5 flex items-center justify-between gap-3"><div><h2 id="workshop-my-maps" className="flex items-center gap-2 text-xl font-bold"><Layers3 size={20} />我的地图<span className="ml-1 text-sm font-normal text-muted">{total}</span></h2><p className="mt-2 text-xs text-muted">草稿可以继续修改；冻结的版本保持原样，供挑战和回放引用。</p></div><Button variant="ghost" onClick={() => setReload(n => n + 1)} disabled={loading || more}><RefreshCw size={16} /><span className="hidden sm:inline">刷新</span></Button></div>
      {!loading && !maps.length && <div className="flex flex-col items-center rounded-[26px] border border-dashed border-line bg-surface/70 px-6 py-12 text-center"><PencilLine size={29} className="mb-4 text-primary" /><h3 className="text-lg font-bold">给花谷留下你的第一笔</h3><p className="mt-2 max-w-md text-sm leading-7 text-muted">选择上方的一张模板，复制后就能移动箱子、调整山丘，设计一条自己的路线。</p></div>}
      <div className="grid gap-4 sm:grid-cols-2">{maps.map(map => <article key={map.mapId} className="rounded-2xl border border-line bg-surface p-5"><div className="flex items-start gap-4"><span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Map size={24} /></span><div className="min-w-0 flex-1"><h3 className="truncate text-lg font-bold">{map.title}</h3><p className="mt-1 text-xs text-muted">草稿修订 {map.revision} · {new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(map.updatedAt))}</p></div></div><div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4"><Link to={`/workshop/maps/${map.mapId}/edit`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white"><PencilLine size={16} />继续编辑</Link>{map.latestVersionId ? <Link to={`/training?practice=1&mission=forest-beacon&tool=curtain&mapVersionId=${map.latestVersionId}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm text-primary"><Play size={15} />试玩已冻结版本</Link> : <span className="text-xs text-muted">还未冻结版本</span>}</div></article>)}</div>
      {maps.length < total && <div className="mt-6 text-center"><Button variant="secondary" disabled={more} onClick={() => void loadMore()}>{more ? '正在加载…' : `加载更多 · 已显示 ${maps.length} / ${total}`}</Button></div>}
    </section>
  </main>;
}
