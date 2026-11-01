import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { GetCurrentPlayerAPI } from '../../apis/player/GetCurrentPlayerAPI.ts';
import { LogoutPlayerAPI } from '../../apis/player/LogoutPlayerAPI.ts';
import { ApiError } from '../api/ApiError.ts';
import { clearSessionToken, getSessionToken, setSessionToken } from '../api/sessionToken.ts';
import { SessionController } from './SessionController.ts';
import type { SessionContextValue } from './SessionContextValue.ts';

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [controller] = useState(() => new SessionController({
    readToken: getSessionToken,
    writeToken: setSessionToken,
    clearToken: clearSessionToken,
    getCurrentPlayer: token => new GetCurrentPlayerAPI().send({ token }),
    logout: token => new LogoutPlayerAPI().send({ token }),
    isUnauthorized: error => error instanceof ApiError && (error.status === 401 || error.code === 'unauthorized' || error.kind === 'auth'),
  }));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  useEffect(() => { void controller.refresh(); }, [controller]);

  const value = useMemo<SessionContextValue>(() => ({
    state,
    refresh: controller.refresh,
    acceptAuth: controller.acceptAuth,
    logout: controller.logout,
    invalidate: controller.invalidate,
  }), [state, controller]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (context === null) throw new Error('useSession must be used inside SessionProvider');
  return context;
}
