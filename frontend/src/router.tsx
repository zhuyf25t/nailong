import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Button } from './components/ui/Button';
import { StatusPanel } from './components/ui/StatusPanel';
import Home from './pages/Home';
import History from './pages/History';
import Result from './pages/Result';
import Training from './pages/Training';
import { useSession } from './system/session/SessionProvider';
import type { GameSettings } from './system/settings/GameSettings';

const Missions = lazy(() => import('./pages/Missions'));
const Loadout = lazy(() => import('./pages/Loadout'));
const Academy = lazy(() => import('./pages/Academy'));
const Replay = lazy(() => import('./pages/Replay'));
const Workshop = lazy(() => import('./pages/Workshop'));
const MapEditor = lazy(() => import('./pages/MapEditor'));

function AccountGate({ children, login }: { children: ReactNode; login: (path: string) => void }) {
  const session = useSession();
  const location = useLocation();
  if (session.state.kind === 'signed-in') return children;
  if (session.state.kind === 'checking') return <StatusPanel title="正在找回你的冒险身份" busy />;
  return <StatusPanel title={session.state.kind === 'unavailable' ? '暂时无法确认登录状态' : '把这次冒险记在你的名字下'}>
    <p>{session.state.kind === 'unavailable' ? session.state.message : '登录或创建账号后，就能开始正式挑战、查看自己的记录。'}</p><div className="flex justify-center gap-3">{session.state.kind === 'unavailable' && <Button variant="secondary" onClick={() => void session.refresh()}>重试连接</Button>}<Button onClick={() => login(location.pathname + location.search)}>登录 / 注册</Button></div>
  </StatusPanel>;
}
function TrainingRoute({ login, ...props }: { login: (path?: string) => void; settings: GameSettings; suspended: boolean; openSettings: () => void }) {
  const location = useLocation();
  const session = useSession();
  const [admitted, setAdmitted] = useState(session.state.kind === 'signed-in');
  useEffect(() => { if (session.state.kind === 'signed-in') setAdmitted(true); }, [session.state.kind]);
  const practice = new URLSearchParams(location.search).get('practice') === '1';
  const page = <Training key={practice ? 'practice' : 'formal'} {...props} suspended={props.suspended || (!practice && session.state.kind !== 'signed-in')} requestLogin={() => login()} />;
  // Once admitted, a session expiry must not unmount a frozen result or its scene.
  return practice || admitted || session.state.kind === 'signed-in' ? page : <AccountGate login={login}>{page}</AccountGate>;
}
export function AppRoutes({ enter, login, settings, suspended, openSettings }: { enter: (path: string) => void; login: (path?: string) => void; settings: GameSettings; suspended: boolean; openSettings: () => void }) {
  return <Suspense fallback={<StatusPanel title="正在翻开下一页…" busy />}><Routes>
    <Route path="/" element={<Home enter={enter} openSettings={openSettings} />} />
    <Route path="/missions" element={<Missions />} />
    <Route path="/missions/:missionId/loadout" element={<Loadout enter={enter} />} />
    <Route path="/training" element={<TrainingRoute login={login} settings={settings} suspended={suspended} openSettings={openSettings} />} />
    <Route path="/history" element={<AccountGate login={login}><History /></AccountGate>} />
    <Route path="/results/:runId" element={<AccountGate login={login}><Result /></AccountGate>} />
    <Route path="/replays/:runId" element={<AccountGate login={login}><Replay /></AccountGate>} />
    <Route path="/academy" element={<Academy settings={settings} suspended={suspended} openSettings={openSettings} />} />
    <Route path="/workshop" element={<AccountGate login={login}><Workshop /></AccountGate>} />
    <Route path="/workshop/maps/:mapId/edit" element={<AccountGate login={login}><MapEditor settings={settings} suspended={suspended} openSettings={openSettings} /></AccountGate>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></Suspense>;
}
