import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { GetTrainingResultAPI } from '../../apis/records/GetTrainingResultAPI.ts';
import { SaveRunEventsAPI } from '../../apis/records/SaveRunEventsAPI.ts';
import { SaveRunReplayAPI } from '../../apis/records/SaveRunReplayAPI.ts';
import { DecodeError } from '../api/DecodeError.ts';
import { useSession } from '../session/SessionProvider.tsx';
import { IndexedDBReplayStorage } from './IndexedDBReplayStorage.ts';
import { ReplayQueue } from './ReplayQueue.ts';
import type { ReplaysContextValue } from './ReplaysContextValue.ts';

const ReplaysContext = createContext<ReplaysContextValue | null>(null);

export function ReplaysProvider({ children }: { readonly children: ReactNode }) {
  const session = useSession();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  const [queue] = useState(() => new ReplayQueue(new IndexedDBReplayStorage(), {
    resultExists: async (item, credentials, signal) => {
      const response = await new GetTrainingResultAPI(item.runId).send({ token: credentials.token, signal });
      if (!response.result) return false;
      if (response.result.playerId !== item.ownerId || response.result.runId !== item.runId) throw new DecodeError('$', 'matching result owner and run');
      return true;
    },
    saveEvents: async (item, credentials, signal) => {
      const response = await new SaveRunEventsAPI(item.runId, item.recorded.summary).send({ token: credentials.token, signal });
      if (response.runId !== item.runId) throw new DecodeError('$', 'matching event runId');
    },
    saveReplay: async (item, credentials, signal) => {
      const response = await new SaveRunReplayAPI(item.runId, item.recorded.replay).send({ token: credentials.token, signal });
      if (response.runId !== item.runId || response.contentHash !== item.recorded.replay.contentHash) throw new DecodeError('$', 'matching replay runId and contentHash');
    },
    onUnauthorized: token => sessionRef.current.invalidate(token),
    onPersisted: () => broadcastRef.current?.postMessage('recording-changed'),
  }));
  const snapshot = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  const ownerId = session.state.kind === 'signed-in' ? session.state.player.id : null;
  const token = session.state.kind === 'signed-in' ? session.state.token : null;

  useEffect(() => {
    queue.setSession(ownerId && token ? { ownerId, token } : null);
    if (ownerId && token) void queue.retry();
    return () => queue.setSession(null);
  }, [queue, ownerId, token]);

  useEffect(() => {
    const retry = () => { if (navigator.onLine) void queue.retry(); };
    const visible = () => { if (document.visibilityState === 'visible') retry(); };
    const timer = window.setInterval(retry, 15_000);
    window.addEventListener('online', retry);
    window.addEventListener('focus', retry);
    document.addEventListener('visibilitychange', visible);
    // IDB changes have no storage event. Periodic/focus refresh remains the fallback.
    let channel: BroadcastChannel | null = null;
    try {
      channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('bloom-valley-recordings-v1');
      broadcastRef.current = channel;
      if (channel) channel.onmessage = () => { void queue.refresh(); };
    } catch { /* Restricted browsers still use the durable queue and interval refresh. */ }
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', retry);
      window.removeEventListener('focus', retry);
      document.removeEventListener('visibilitychange', visible);
      channel?.close(); broadcastRef.current = null;
    };
  }, [queue]);

  useEffect(() => {
    const preventDataLoss = (event: BeforeUnloadEvent) => {
      if (!queue.hasUnpersisted()) return;
      event.preventDefault(); event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventDataLoss);
    return () => window.removeEventListener('beforeunload', preventDataLoss);
  }, [queue]);

  const enqueue = useCallback<ReplaysContextValue['enqueue']>(async (owner, run, recorded) => {
    try { await queue.enqueue(owner, run, recorded); }
    finally { if (navigator.onLine) void queue.retry(run); }
  }, [queue]);
  const getLocal = useCallback<ReplaysContextValue['getLocal']>(async (owner, run) => {
    const state = sessionRef.current.state;
    if (state.kind !== 'signed-in' || state.player.id !== owner) return null;
    // Child passive effects can run before this provider's session effect on login.
    // Synchronize at the read action, otherwise the first offline read looks absent.
    queue.setSession({ ownerId: state.player.id, token: state.token });
    return queue.getLocal(owner, run);
  }, [queue]);
  const getStatus = useCallback<ReplaysContextValue['getStatus']>((owner, run) => {
    const state = sessionRef.current.state;
    return state.kind === 'signed-in' && state.player.id === owner ? queue.getStatus(owner, run) : undefined;
  }, [queue]);
  const value = useMemo<ReplaysContextValue>(() => ({
    ...snapshot,
    // Filter again during the render preceding the session effect: never flash another owner's entries.
    items: snapshot.items.filter(item => item.ownerId === ownerId),
    enqueue,
    getLocal,
    getStatus,
    retry: queue.retry,
  }), [queue, snapshot, ownerId, enqueue, getLocal, getStatus]);
  return <ReplaysContext.Provider value={value}>{children}</ReplaysContext.Provider>;
}

export function useReplays(): ReplaysContextValue {
  const context = useContext(ReplaysContext);
  if (!context) throw new Error('useReplays 必须位于 ReplaysProvider 内。');
  return context;
}
