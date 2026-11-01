import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { SaveTrainingResultAPI } from '../../apis/records/SaveTrainingResultAPI.ts';
import { PendingResultQueue, isPendingResultsStorageKey } from './PendingResultQueue.ts';
import type { PendingResultsContextValue } from './PendingResultsContextValue.ts';
import type { QueueStorage } from './QueueStorage.ts';

const PendingResultsContext = createContext<PendingResultsContextValue | null>(null);

function availableStorage(): QueueStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function PendingResultsProvider({ children }: { readonly children: ReactNode }) {
  const [queue] = useState(() => new PendingResultQueue(
    availableStorage(),
    (item, session) => new SaveTrainingResultAPI(item.runId, item.submission).send({ token: session.token }),
  ));
  const snapshot = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (isPendingResultsStorageKey(event.key)) queue.refreshFromStorage();
    };
    window.addEventListener('storage', sync);
    // Cover a write by another tab between initial render and listener setup.
    queue.refreshFromStorage();
    return () => window.removeEventListener('storage', sync);
  }, [queue]);
  const value = useMemo<PendingResultsContextValue>(() => ({
    ...snapshot,
    itemsFor: queue.itemsFor,
    enqueue: queue.enqueue,
    retry: queue.retry,
    retryAll: queue.retryAll,
    getStatus: queue.getStatus,
  }), [queue, snapshot]);
  return <PendingResultsContext.Provider value={value}>{children}</PendingResultsContext.Provider>;
}

export function usePendingResults(): PendingResultsContextValue {
  const context = useContext(PendingResultsContext);
  if (context === null) throw new Error('usePendingResults 必须位于 PendingResultsProvider 内。');
  return context;
}
