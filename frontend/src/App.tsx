import { useEffect, useRef, useState } from 'react';
import { CloudUpload, Compass, Film, Hammer, Leaf, LoaderCircle, LogOut, NotebookPen, TentTree, UserRound } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from './components/ui/Button';
import { Modal } from './components/ui/Modal';
import { AuthModal } from './pages/Auth/AuthModal';
import { AppRoutes } from './router';
import { useSession } from './system/session/SessionProvider';
import { usePendingResults } from './system/results/PendingResultsProvider';
import { SettingsModal } from './system/settings/SettingsModal';
import { useGameSettings } from './system/settings/useGameSettings';
import { getSessionToken } from './system/api/sessionToken';
import { useReplays } from './system/replays/ReplaysProvider';

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useSession();
  const pending = usePendingResults();
  const recordings = useReplays();
  const preferences = useGameSettings();
  const [authOpen, setAuthOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const intent = useRef<string | null>(null);
  const latestLocation = useRef(location.pathname);
  latestLocation.current = location.pathname;
  const inTraining = location.pathname === '/training';
  const ownedItems = session.state.kind === 'signed-in' ? pending.itemsFor(session.state.player.id) : [];
  const ownedRecordings = recordings.items.filter(item => item.events.status !== 'saved' || item.replay.status !== 'saved');
  const unsavedCount = new Set([...ownedItems.map(item => item.runId), ...ownedRecordings.map(item => item.runId)]).size;
  const login = (path?: string) => { if (logoutBusy) return; intent.current = path ?? null; setAuthOpen(true); };
  const enter = (path: string) => { if (!logoutBusy) { if (session.state.kind === 'signed-in') navigate(path); else login(path); } };
  const authenticated = () => { const next = intent.current; intent.current = null; if (next) navigate(next); };
  const closeAuth = (open: boolean) => { setAuthOpen(open); if (!open) intent.current = null; };

  useEffect(() => {
    if (session.state.kind !== 'signed-in') return;
    const owner = { playerId: session.state.player.id, token: session.state.token };
    const retry = () => { void pending.retryAll(owner); };
    retry();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [session.state, pending.retryAll]);
  useEffect(() => {
    const pageTitle = location.pathname === '/' ? '营地' : location.pathname === '/history' ? '行动手记' : location.pathname.startsWith('/results') ? '行动报告' : location.pathname.startsWith('/replays') ? '战术回放' : location.pathname === '/academy' ? '训练课堂' : location.pathname.includes('/loadout') ? '出发整备' : location.pathname === '/missions' ? '任务地图' : location.pathname.includes('/edit') ? '地图编辑器' : location.pathname.startsWith('/workshop') ? '地图工坊' : '花谷行动';
    document.title = `${pageTitle} · 奶龙小靶场`;
    if (!inTraining) window.scrollTo(0, 0);
    const focusFrame = requestAnimationFrame(() => {
      const heading = document.querySelector('main h1') ?? document.querySelector('main');
      if (heading instanceof HTMLElement) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    });
    return () => cancelAnimationFrame(focusFrame);
  }, [location.pathname, inTraining]);
  const logout = async () => {
    if (logoutBusy) return;
    const departure = location.pathname;
    setLogoutBusy(true); setMessage(null);
    try { await session.logout(); if (getSessionToken() === null && latestLocation.current === departure) navigate('/'); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : '暂时无法退出，请重试。'); }
    finally { setLogoutBusy(false); }
  };
  return <>
    {!inTraining && <header className="mx-auto flex min-h-24 max-w-[1440px] flex-wrap items-center justify-between gap-2 px-5 py-3 sm:px-8 lg:px-11">
      <Link to="/" className="flex min-h-12 items-center gap-3 rounded-xl"><span className="flex size-10 items-center justify-center rounded-2xl bg-amber text-ink"><Leaf size={23} /></span><span><strong className="block text-lg tracking-tight">奶龙小靶场</strong><span className="mt-0.5 block text-[9px] tracking-[.2em] text-muted">BLOOM VALLEY / 花谷巡猎</span></span></Link>
      <nav aria-label="主导航" className="order-3 grid w-full grid-cols-4 gap-1 rounded-2xl bg-[#eeeddf] p-1 lg:order-none lg:w-auto lg:gap-2">
        {[{ to: '/', label: '营地', icon: TentTree, active: location.pathname === '/' }, { to: '/missions', label: '任务', icon: Compass, active: location.pathname.startsWith('/missions') || location.pathname === '/academy' }, { to: '/history', label: '手记', icon: NotebookPen, active: ['/history', '/results', '/replays'].some(path => location.pathname.startsWith(path)) }, { to: '/workshop', label: '工坊', icon: Hammer, active: location.pathname.startsWith('/workshop') }].map(item => <Link key={item.to} to={item.to} aria-current={item.active ? 'page' : undefined} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold transition-colors sm:px-5 sm:text-sm ${item.active ? 'bg-surface text-primary shadow-sm' : 'text-muted hover:bg-white/50 hover:text-ink'}`}><item.icon size={16} aria-hidden />{item.label}</Link>)}
      </nav>
      <div className="flex flex-wrap items-center gap-1 sm:gap-2">
        {unsavedCount > 0 && <Button variant="ghost" onClick={() => setPendingOpen(true)} aria-label={`待保存成绩与回放，共${unsavedCount}局`}><CloudUpload size={17} /><span className="text-xs">待保存 {unsavedCount}</span></Button>}
        {session.state.kind === 'checking' ? <span className="flex items-center gap-2 px-3 text-xs text-muted"><LoaderCircle className="animate-spin" size={14} />恢复身份…</span> : session.state.kind === 'signed-in' ? <><button className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm hover:bg-ink/5" aria-label={`${session.state.player.nickname}，重新登录或切换账号`} onClick={() => login()}><UserRound size={17} /><span className="max-w-32 truncate">{session.state.player.nickname}</span></button><button className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted hover:bg-ink/5" aria-label="退出当前账号" onClick={() => void logout()} disabled={logoutBusy}>{logoutBusy ? <LoaderCircle size={17} className="animate-spin" /> : <LogOut size={17} />}</button></> : <Button variant="secondary" onClick={() => login()}>登录 / 注册</Button>}
      </div>
    </header>}
    {!inTraining && (message || pending.corruptStorage || pending.storageWarning || recordings.storageWarning || session.state.kind === 'unavailable') && <div role="status" className="mx-auto mb-4 max-w-[1360px] space-y-1 rounded-xl bg-amber/15 px-5 py-3 text-xs leading-6 text-ink">{message && <p>{message}</p>}{pending.corruptStorage && <p>{pending.corruptStorage}</p>}{pending.storageWarning && <p>{pending.storageWarning}</p>}{recordings.storageWarning && <p>{recordings.storageWarning}</p>}{session.state.kind === 'unavailable' && <p>{session.state.message} <button className="ml-2 underline" onClick={() => void session.refresh()}>重新连接</button></p>}</div>}
    <AppRoutes enter={enter} login={login} settings={preferences.settings} suspended={settingsOpen || authOpen || pendingOpen} openSettings={() => setSettingsOpen(true)} />
    <AuthModal open={authOpen} onOpenChange={closeAuth} onAuthenticated={authenticated} />
    <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} settings={preferences.settings} update={preferences.updateSettings} warning={preferences.warning} />
    <Modal open={pendingOpen} onOpenChange={setPendingOpen} title="待保存的成绩与回放" description="这里只展示当前账号。成绩、事件和回放分别保存；联网后会自动补传，也可以手动重试。">
      {unsavedCount === 0 && <p className="py-6 text-center text-sm text-muted">所有手记都已保存。</p>}
      {ownedItems.length > 0 && <div className="space-y-4"><h2 className="text-sm font-semibold">挑战成绩</h2>{ownedItems.map(item => {
        const state = pending.getStatus(item.playerId, item.runId);
        return <article key={item.runId} className="rounded-2xl border border-line p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold">{item.submission.outcome === 'victory' ? '花谷守护成功' : '一次勇敢的尝试'}</p><p className="mt-1 text-xs text-muted">击毁 {item.submission.destroyed} 架 · {(item.submission.elapsedMs / 1000).toFixed(1)} 秒</p></div><Button variant="secondary" disabled={state?.status === 'saving'} onClick={() => { if (session.state.kind === 'signed-in') void pending.retry(item, { playerId: session.state.player.id, token: session.state.token }); }}>{state?.status === 'saving' ? '保存中…' : '重试保存'}</Button></div>{state?.status === 'failed' && <p role="status" className="mt-3 text-xs text-danger">{state.message}</p>}</article>;
      })}</div>}
      {ownedRecordings.length > 0 && <section className="mt-6 space-y-3"><h2 className="flex items-center gap-2 text-sm font-semibold"><Film size={16} />事件与战术回放</h2>{ownedRecordings.map(item => {
        const busy = item.events.status === 'uploading' || item.replay.status === 'uploading';
        const label = (status: 'pending' | 'uploading' | 'saved' | 'blocked') => status === 'saved' ? '已保存' : status === 'uploading' ? '正在上传' : status === 'blocked' ? '需要重试' : '等待上传';
        return <article key={item.runId} className="rounded-2xl border border-line p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">{new Date(item.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 的行动</p><p className="mt-2 text-xs leading-6 text-muted">事件：{label(item.events.status)}<br />回放：{label(item.replay.status)}</p></div><Button variant="secondary" disabled={busy} onClick={() => void recordings.retry(item.runId)}>{busy ? '补传中…' : '重试补传'}</Button></div>{(item.events.message || item.replay.message) && <p role="status" className="mt-3 text-xs leading-6 text-danger">{item.events.message ?? item.replay.message}</p>}{!item.durable && <p className="mt-2 text-xs text-danger">这份回放暂时只保留在页面内，请勿刷新或关闭。</p>}</article>;
      })}</section>}
      {pending.storageWarning && <p role="alert" className="mt-4 text-xs text-danger">{pending.storageWarning}</p>}
      {recordings.storageWarning && <p role="alert" className="mt-4 text-xs text-danger">{recordings.storageWarning}</p>}
    </Modal>
  </>;
}
