import { useEffect, useRef, useState } from 'react';
import { CloudUpload, Leaf, LoaderCircle, LogOut, UserRound } from 'lucide-react';
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

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useSession();
  const pending = usePendingResults();
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
    document.title = location.pathname === '/' ? '奶龙小靶场 · 花谷巡猎' : location.pathname === '/history' ? '我的花谷记录 · 奶龙小靶场' : location.pathname.startsWith('/results') ? '行动手记 · 奶龙小靶场' : '花谷行动 · 奶龙小靶场';
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
      <div className="flex flex-wrap items-center gap-1 sm:gap-2">
        {ownedItems.length > 0 && <Button variant="ghost" onClick={() => setPendingOpen(true)}><CloudUpload size={17} /><span className="text-xs">待保存 {ownedItems.length}</span></Button>}
        {session.state.kind === 'checking' ? <span className="flex items-center gap-2 px-3 text-xs text-muted"><LoaderCircle className="animate-spin" size={14} />恢复身份…</span> : session.state.kind === 'signed-in' ? <><button className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm hover:bg-ink/5" aria-label={`${session.state.player.nickname}，重新登录或切换账号`} onClick={() => login()}><UserRound size={17} /><span className="max-w-32 truncate">{session.state.player.nickname}</span></button><button className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted hover:bg-ink/5" aria-label="退出当前账号" onClick={() => void logout()} disabled={logoutBusy}>{logoutBusy ? <LoaderCircle size={17} className="animate-spin" /> : <LogOut size={17} />}</button></> : <Button variant="secondary" onClick={() => login()}>登录 / 注册</Button>}
      </div>
    </header>}
    {!inTraining && (message || pending.corruptStorage || pending.storageWarning || session.state.kind === 'unavailable') && <div role="status" className="mx-auto mb-4 max-w-[1360px] space-y-1 rounded-xl bg-amber/15 px-5 py-3 text-xs leading-6 text-ink">{message && <p>{message}</p>}{pending.corruptStorage && <p>{pending.corruptStorage}</p>}{pending.storageWarning && <p>{pending.storageWarning}</p>}{session.state.kind === 'unavailable' && <p>{session.state.message} <button className="ml-2 underline" onClick={() => void session.refresh()}>重新连接</button></p>}</div>}
    <AppRoutes enter={enter} login={login} settings={preferences.settings} suspended={settingsOpen || authOpen || pendingOpen} openSettings={() => setSettingsOpen(true)} />
    <AuthModal open={authOpen} onOpenChange={closeAuth} onAuthenticated={authenticated} />
    <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} settings={preferences.settings} update={preferences.updateSettings} warning={preferences.warning} />
    <Modal open={pendingOpen} onOpenChange={setPendingOpen} title="还没寄出的行动手记" description="这里只展示当前账号的结果。联网后会自动重试，也可以手动保存。">
      {ownedItems.length === 0 ? <p className="py-6 text-center text-sm text-muted">所有手记都已保存。</p> : <div className="space-y-4">{ownedItems.map(item => {
        const state = pending.getStatus(item.playerId, item.runId);
        return <article key={item.runId} className="rounded-2xl border border-line p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold">{item.submission.outcome === 'victory' ? '花谷守护成功' : '一次勇敢的尝试'}</p><p className="mt-1 text-xs text-muted">击毁 {item.submission.destroyed} 架 · {(item.submission.elapsedMs / 1000).toFixed(1)} 秒</p></div><Button variant="secondary" disabled={state?.status === 'saving'} onClick={() => { if (session.state.kind === 'signed-in') void pending.retry(item, { playerId: session.state.player.id, token: session.state.token }); }}>{state?.status === 'saving' ? '保存中…' : '重试保存'}</Button></div>{state?.status === 'failed' && <p role="status" className="mt-3 text-xs text-danger">{state.message}</p>}</article>;
      })}</div>}
      {pending.storageWarning && <p role="alert" className="mt-4 text-xs text-danger">{pending.storageWarning}</p>}
    </Modal>
  </>;
}
