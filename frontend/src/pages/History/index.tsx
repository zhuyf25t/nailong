import { ArrowLeft, ArrowRight, Leaf, RefreshCw, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button.tsx';
import { useSession } from '../../system/session/SessionProvider.tsx';
import { formatElapsed } from '../Result/utils/formatResult.ts';
import { ResultRow } from './components/ResultRow.tsx';
import { useHistory } from './hooks/useHistory.ts';

export default function History() {
  const { state: session } = useSession();
  const { history, more, best, refresh, retryBest, loadMore, canLoadMore, reachedOffsetLimit } = useHistory(session.kind === 'signed-in' ? session.token : undefined);
  const loadedVictories = history.kind === 'ready' ? history.items.filter(result => result.outcome === 'victory').length : 0;
  return <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
    <Link className="mb-7 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline" to="/"><ArrowLeft size={17} aria-hidden="true" />回主菜单</Link>
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div><p className="mb-3 text-xs font-semibold tracking-[0.2em] text-muted">FIELD NOTES · MY ADVENTURES</p><h1 tabIndex={-1} className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">我的花谷记录</h1><p className="mt-3 text-muted">{session.kind === 'signed-in' ? `${session.player.nickname}，每次出发都值得记住。` : '每次出发都值得记住。'}</p></div>
      <Link to="/training" className="inline-flex min-h-12 items-center justify-center gap-3 rounded-2xl bg-primary px-6 font-semibold text-white hover:bg-primary-hover">再次出发<ArrowRight size={18} aria-hidden="true" /></Link>
    </div>
    <section aria-label="成绩摘要" className="my-9 grid gap-7 border-y border-line py-7 sm:grid-cols-3 sm:gap-8">
      <div><p className="flex items-center gap-2 text-sm text-muted"><Trophy size={16} aria-hidden="true" />标准花谷 · 最快通关</p>
        {best.kind === 'loading' ? <p role="status" className="mt-3 text-lg text-muted">正在查询…</p> : best.kind === 'failed' ? <div className="mt-2"><p className="text-sm text-muted">暂时无法查询最佳成绩</p><button className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4" onClick={retryBest}>重试查询</button></div> : <><p className="mt-3 text-2xl font-bold tabular-nums text-ink">{best.best === null ? '尚未通关' : formatElapsed(best.best.elapsedMs)}</p><p className="mt-2 text-xs leading-relaxed text-muted">仅当前 {best.config.version}、默认地形的胜利局</p></>}
      </div>
      <div><p className="text-sm text-muted">已载入记录中的通关局数</p><p className="mt-3 text-2xl font-bold tabular-nums text-ink">{history.kind === 'ready' ? <>{loadedVictories}<span className="ml-2 text-sm font-normal text-muted">/ {history.items.length} 局</span></> : history.kind === 'empty' ? '0 局' : '—'}</p><p className="mt-2 text-xs text-muted">{history.kind === 'ready' ? `共 ${history.total} 条已保存记录` : '只统计已保存的正式挑战'}</p></div>
      <div><p className="text-sm text-muted">最近一次出发</p><p className="mt-3 text-2xl font-bold text-ink">{history.kind === 'ready' ? history.items[0]?.outcome === 'victory' ? '成功通关' : '下次再战' : history.kind === 'empty' ? '等待你的第一局' : '—'}</p><p className="mt-2 text-xs text-muted">胜利和失败，都是冒险的一部分</p></div>
    </section>
    <div className="mb-2 flex items-center justify-between gap-4"><h2 className="text-xl font-semibold text-ink">挑战手记</h2><Button variant="ghost" onClick={refresh} disabled={history.kind === 'loading' || more.kind === 'loading'}><RefreshCw size={16} aria-hidden="true" />刷新记录</Button></div>
    {history.kind === 'loading' && <div role="status" aria-label="正在加载挑战记录" className="space-y-4 py-4">{[0, 1, 2, 3].map(index => <div key={index} className="flex h-20 items-center gap-5 border-b border-line"><div className="h-11 w-11 animate-pulse rounded-xl bg-line/50" /><div className="h-4 w-1/2 animate-pulse rounded bg-line/40" /></div>)}<p className="text-sm text-muted">正在翻开你的冒险手记…</p></div>}
    {history.kind === 'failed' && <section role="alert" className="my-6 rounded-3xl border border-line bg-surface px-6 py-10"><h3 className="text-xl font-semibold text-ink">记录暂时没有读到</h3><p className="mt-3 text-muted">{history.message}</p><Button className="mt-6" onClick={refresh}>重新加载</Button></section>}
    {history.kind === 'empty' && <section className="my-6 rounded-3xl border border-line bg-surface px-6 py-12 text-center"><Leaf size={35} className="mx-auto mb-5 text-primary" aria-hidden="true" /><h3 className="text-2xl font-bold text-ink">第一段冒险，从这里开始</h3><p className="mx-auto mt-3 max-w-md leading-relaxed text-muted">花谷里的无人机正在巡逻。开始一局正式挑战，你的胜败与用时就会留在这里。</p><Link to="/training" className="mt-7 inline-flex min-h-12 items-center gap-3 rounded-2xl bg-primary px-6 font-semibold text-white hover:bg-primary-hover">开始挑战<ArrowRight size={18} aria-hidden="true" /></Link></section>}
    {history.kind === 'ready' && history.items.length > 0 && <>
      <div aria-hidden="true" className="hidden grid-cols-[auto_1.5fr_1fr_1fr_1fr_auto] gap-4 border-b border-line px-3 py-3 text-xs text-muted sm:grid"><span className="w-11" /><span>结果与日期</span><span>击毁</span><span>用时</span><span>命中率</span><span className="w-5" /></div>
      <ol aria-label="按时间从新到旧排列的挑战记录"><>{history.items.map(result => <ResultRow key={result.runId} result={result} />)}</></ol>
      <div className="mt-7 flex flex-col items-center gap-3" aria-live="polite">
        {more.kind === 'failed' && <p role="alert" className="text-center text-sm text-danger">{more.message} 已载入的记录仍然保留。</p>}
        {canLoadMore && <Button variant="secondary" onClick={() => { void loadMore(); }} disabled={more.kind === 'loading'}>{more.kind === 'loading' ? '正在加载更多…' : more.kind === 'failed' ? '重试加载更多' : '加载更多'}</Button>}
        <p className="text-xs text-muted">已显示 {history.items.length} / {history.total} 条记录{reachedOffsetLimit ? ' · 已达到本次浏览的查询上限' : !canLoadMore ? ' · 已经到底啦' : ''}</p>
      </div>
    </>}
  </main>;
}
