import { useEffect, useState } from 'react';
import { ArrowRight, Bookmark, Check, Columns2, Leaf, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button.tsx';
import { useSession } from '../../system/session/SessionProvider.tsx';
import { formatElapsed, formatDate, formatAccuracy } from '../Result/utils/formatResult.ts';
import { useHistory } from './hooks/useHistory.ts';
import { useFavorites } from './hooks/useFavorites.ts';
import { canCompare, missionTitle } from './functions/archive.ts';
import { Comparison } from './components/Comparison.tsx';

export default function History() {
  const { state: session } = useSession();
  const owner = session.kind === 'signed-in' ? session.player.id : undefined;
  const { history, more, refresh, loadMore, canLoadMore, reachedOffsetLimit } = useHistory(session.kind === 'signed-in' ? session.token : undefined);
  const favorites = useFavorites(owner);
  const [outcome, setOutcome] = useState('all');
  const [mission, setMission] = useState('all');
  const [query, setQuery] = useState('');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [selection, setSelection] = useState<readonly string[]>([]);
  useEffect(() => { setSelection([]); setOnlyFavorites(false); setQuery(''); }, [owner]);
  const items = history.kind === 'ready' ? history.items : [];
  const selected = items.filter(item => selection.includes(item.runId));
  const visible = items.filter(item => (outcome === 'all' || item.outcome === outcome)
    && (mission === 'all' || (item.setup?.mission.id ?? 'legacy') === mission)
    && (!onlyFavorites || favorites.ids.includes(item.runId))
    && (!query.trim() || `${missionTitle(item)} ${item.configVersion} ${item.runId}`.toLowerCase().includes(query.trim().toLowerCase())));
  const missions = [...new Map(items.map(item => [item.setup?.mission.id ?? 'legacy', missionTitle(item)])).entries()];
  const toggleCompare = (id: string) => setSelection(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id].slice(-2));
  return <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
    <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="mb-3 text-xs font-semibold tracking-[.2em] text-muted">FIELD NOTES / EVERY ATTEMPT COUNTS</p><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">行动档案</h1><p className="mt-3 text-muted">找到一个转折，带着新想法再出发。</p></div><Link to="/missions" className="inline-flex min-h-12 items-center gap-3 rounded-2xl bg-primary px-6 font-semibold text-white">选择下一次行动<ArrowRight size={18} /></Link></div>
    <section aria-label="档案摘要" className="my-8 grid gap-6 border-y border-line py-6 sm:grid-cols-3">
      <div><p className="text-sm text-muted">已保存的行动</p><p className="mt-2 text-3xl font-bold tabular-nums">{history.kind === 'ready' ? history.total : history.kind === 'empty' ? 0 : '—'}</p></div>
      <div><p className="text-sm text-muted">已载入记录中的任务完成</p><p className="mt-2 text-3xl font-bold tabular-nums">{items.filter(item => item.outcome === 'victory').length}<span className="ml-2 text-sm font-normal text-muted">/ {items.length} 局</span></p></div>
      <div><p className="text-sm text-muted">本机收藏</p><p className="mt-2 text-3xl font-bold tabular-nums">{favorites.ids.length}</p><p className="mt-2 text-xs text-muted">收藏按账号区分，保存在当前设备</p></div>
    </section>
    <div className="mb-5 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap gap-3"><input aria-label="搜索任务、规则或局次" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索任务、规则或局次" className="min-h-11 min-w-36 flex-1 rounded-xl border border-line bg-paper px-3 text-sm" />
        <select aria-label="筛选任务" value={mission} onChange={event => setMission(event.target.value)} className="min-h-11 rounded-xl border border-line bg-paper px-3 text-sm"><option value="all">全部任务</option>{missions.map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select>
        <select aria-label="筛选结果" value={outcome} onChange={event => setOutcome(event.target.value)} className="min-h-11 rounded-xl border border-line bg-paper px-3 text-sm"><option value="all">全部结果</option><option value="victory">任务完成</option><option value="defeat">未完成</option></select>
        <Button variant={onlyFavorites ? 'primary' : 'secondary'} onClick={() => setOnlyFavorites(value => !value)} aria-pressed={onlyFavorites}><Bookmark size={16} />收藏</Button><Button variant="ghost" onClick={refresh} disabled={history.kind === 'loading' || more.kind === 'loading'}><RefreshCw size={16} />刷新</Button>
      </div><p className="mt-3 text-xs leading-6 text-muted">筛选与比较作用于已载入记录；可继续加载更早的行动。地图、目标、规则、地形与工具相同的两局才能对比。</p>{favorites.warning && <p role="status" className="mt-2 text-xs text-danger">{favorites.warning}</p>}
    </div>
    {selected.length > 0 && <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-primary/5 px-4 py-3 text-sm"><Columns2 size={17} /><span>{selected.length === 1 ? '再选择一局相同配置的行动。' : '已选中两局。'}</span><button className="min-h-10 text-primary underline" onClick={() => setSelection([])}>清除选择</button></div>}
    <Comparison results={selected} close={() => setSelection([])} />
    {history.kind === 'loading' && <div role="status" className="space-y-4 py-4">{[0, 1, 2].map(index => <div key={index} className="h-28 animate-pulse rounded-2xl bg-line/30" />)}<p className="text-sm text-muted">正在翻开行动手记…</p></div>}
    {history.kind === 'failed' && <section role="alert" className="rounded-3xl border border-line bg-surface p-8"><h2 className="text-xl font-bold">档案暂时没有读到</h2><p className="mt-3 text-muted">{history.message}</p><Button className="mt-6" onClick={refresh}>重新加载</Button></section>}
    {history.kind === 'empty' && <section className="rounded-3xl border border-line bg-surface px-6 py-12 text-center"><Leaf size={35} className="mx-auto mb-5 text-primary" /><h2 className="text-2xl font-bold">第一段冒险，从这里开始</h2><p className="mt-3 text-muted">完成一次正式行动，报告与真实回放就会出现在这里。</p><Link to="/missions" className="mt-6 inline-flex min-h-12 items-center rounded-2xl bg-primary px-6 font-semibold text-white">去任务地图</Link></section>}
    {history.kind === 'ready' && <><ol className="space-y-3" aria-label="行动记录">{visible.map(result => {
      const picked = selection.includes(result.runId);
      const compatible = !selected.length || picked || canCompare(selected[0], result);
      return <li key={result.runId} className={`rounded-2xl border bg-surface p-5 ${picked ? 'border-primary/60' : 'border-line'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><Link to={`/results/${result.runId}`} className="inline-flex min-h-10 items-center gap-3 font-semibold hover:text-primary"><span className={`size-2 rounded-full ${result.outcome === 'victory' ? 'bg-primary' : 'bg-danger/70'}`} />{missionTitle(result)}<ArrowRight size={16} /></Link><p className="text-xs text-muted">{formatDate(result.submittedAt)} · {result.outcome === 'victory' ? '任务完成' : '未完成'}</p></div>
          <div className="flex items-center gap-2"><button className={`flex min-h-11 min-w-11 items-center justify-center rounded-xl ${favorites.ids.includes(result.runId) ? 'bg-amber/25 text-ink' : 'text-muted hover:bg-paper'}`} aria-label={favorites.ids.includes(result.runId) ? '取消收藏这局' : '收藏这局'} aria-pressed={favorites.ids.includes(result.runId)} onClick={() => favorites.toggle(result.runId)}><Bookmark size={18} fill={favorites.ids.includes(result.runId) ? 'currentColor' : 'none'} /></button><button className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm text-primary disabled:cursor-not-allowed disabled:opacity-35" aria-pressed={picked} title={compatible ? '选择两局进行比较' : '配置不同，不能直接比较'} disabled={!compatible} onClick={() => toggleCompare(result.runId)}>{picked ? <Check size={17} /> : <Columns2 size={17} />}{picked ? '已选择' : '对比'}</button></div>
        </div><div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-3 text-sm"><span>用时 <strong>{formatElapsed(result.elapsedMs)}</strong></span><span>击毁 <strong>{result.destroyed} 架</strong></span><span>命中率 <strong>{formatAccuracy(result.hits, result.shotsFired)}</strong></span><span className="text-xs leading-5 text-muted">{result.configVersion}</span></div>
      </li>;
    })}</ol>{visible.length === 0 && <p className="rounded-2xl bg-surface p-8 text-center text-muted">已载入记录中没有符合条件的行动。调整筛选，或加载更早的记录。</p>}
      <div className="mt-7 flex flex-col items-center gap-3" aria-live="polite">{more.kind === 'failed' && <p role="alert" className="text-sm text-danger">{more.message}</p>}{canLoadMore && <Button variant="secondary" onClick={() => void loadMore()} disabled={more.kind === 'loading'}>{more.kind === 'loading' ? '正在加载…' : '加载更早的行动'}</Button>}<p className="text-xs text-muted">筛选后 {visible.length} 条 · 已载入 {items.length} / {history.total} 条{reachedOffsetLimit ? ' · 已达到查询上限' : ''}</p></div>
    </>}
  </main>;
}
