import { ArrowLeft, ArrowRight, CheckCircle2, FileQuestion, RefreshCw } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button.tsx';
import { useSession } from '../../system/session/SessionProvider.tsx';
import { ResultSummary } from './components/ResultSummary.tsx';
import { useResult } from './hooks/useResult.ts';
import { formatDate } from './utils/formatResult.ts';

export default function Result() {
  const { runId } = useParams<{ runId: string }>();
  const { state: session } = useSession();
  const { state, retry } = useResult(runId, session.kind === 'signed-in' ? session.token : undefined);
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
      <Link className="mb-8 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline" to="/history"><ArrowLeft size={17} aria-hidden="true" />我的记录</Link>
      <p className="mb-3 text-xs font-semibold tracking-[0.2em] text-muted">FIELD NOTES · RESULT</p>
      <h1 tabIndex={-1} className="mb-8 text-3xl font-bold tracking-tight text-ink sm:text-4xl">这一次花谷冒险</h1>
      {state.kind === 'loading' && <div role="status" className="rounded-3xl border border-line bg-surface p-8"><div className="mb-5 h-7 w-44 animate-pulse rounded bg-line/50" /><div className="h-32 animate-pulse rounded-2xl bg-line/30" /><p className="mt-5 text-muted">正在读取本局记录…</p></div>}
      {state.kind === 'saved' && <article className="rounded-3xl border border-line bg-surface p-6 sm:p-9">
        <ResultSummary submission={state.result} />
        <p className="mt-6 flex items-center gap-2 text-sm text-primary"><CheckCircle2 size={17} aria-hidden="true" />已记入你的挑战记录</p>
        <dl className="mt-7 space-y-3 border-t border-line pt-6 text-sm">
          <div className="flex flex-wrap justify-between gap-x-6 gap-y-1"><dt className="text-muted">记录时间</dt><dd className="text-ink">{formatDate(state.result.submittedAt)}</dd></div>
          <div className="flex flex-wrap justify-between gap-x-6 gap-y-1"><dt className="text-muted">规则版本</dt><dd className="break-all text-ink">{state.result.configVersion}</dd></div>
          <div className="flex flex-wrap justify-between gap-x-6 gap-y-1"><dt className="text-muted">地形参数</dt><dd className="text-ink">山丘 {state.result.terrain.hillHeight} m · 起伏 {state.result.terrain.ripple}</dd></div>
          <div className="flex flex-wrap justify-between gap-x-6 gap-y-1"><dt className="text-muted">局次编号</dt><dd className="break-all font-mono text-xs text-muted">{state.result.runId}</dd></div>
        </dl>
        <div className="mt-8 grid gap-3 sm:grid-cols-2"><Link to="/training" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-5 font-semibold text-white hover:bg-primary-hover">再来一局<ArrowRight size={18} aria-hidden="true" /></Link><Link to="/" className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-line px-5 font-semibold text-ink hover:bg-paper">回主菜单</Link></div>
      </article>}
      {state.kind !== 'loading' && state.kind !== 'saved' && <section className="rounded-3xl border border-line bg-surface p-8 sm:p-10">
        <FileQuestion size={35} className="mb-5 text-muted" aria-hidden="true" />
        <h2 className="text-xl font-bold text-ink">{state.kind === 'invalid' ? '记录地址不完整' : state.kind === 'not-found' ? '没有找到这条记录' : state.kind === 'failed' ? '记录暂时无法打开' : state.run.status === 'abandoned' ? '这局已放弃' : state.run.status === 'completed' ? '成绩正在核对中' : '这局尚未提交成绩'}</h2>
        <p className="mt-3 leading-relaxed text-muted">{state.kind === 'invalid' ? '请从“我的记录”选择一局，打开正确的详情地址。' : state.kind === 'not-found' ? '这条记录不存在，或不属于当前登录账号。' : state.kind === 'failed' ? state.message : state.run.status === 'abandoned' ? '离开前已结束这次挑战，因此没有产生通关或失败成绩。' : state.run.status === 'completed' ? '该局已经结束，但成绩尚未读取到。请稍后重新查询。' : '这次挑战已创建，还没有保存胜败结果。若本机仍有待保存成绩，可在顶部“待保存”中重试；重新挑战会创建新的一局。'}</p>
        {state.kind === 'unsubmitted' && <p className="mt-4 text-sm text-muted">开始于 {formatDate(state.run.startedAt)}</p>}
        <div className="mt-7 flex flex-wrap gap-3">{(state.kind === 'failed' || (state.kind === 'unsubmitted' && state.run.status !== 'abandoned')) && <Button onClick={retry} variant="secondary"><RefreshCw size={16} aria-hidden="true" />重新查询</Button>}<Link to="/history" className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-primary px-5 font-semibold text-white hover:bg-primary-hover">返回我的记录</Link></div>
      </section>}
    </main>
  );
}
