import { useCallback, useEffect, useRef, useState } from 'react';
import { GetMyBestAPI } from '../../../apis/records/GetMyBestAPI.ts';
import { ListMyResultsAPI } from '../../../apis/records/ListMyResultsAPI.ts';
import { GetTrainingConfigAPI } from '../../../apis/training/GetTrainingConfigAPI.ts';
import type { SessionToken } from '../../../objects/system/SessionToken.ts';
import { ApiError } from '../../../system/api/ApiError.ts';
import { useSession } from '../../../system/session/SessionProvider.tsx';
import type { HistoryState } from '../objects/HistoryState.ts';
import type { MoreState } from '../objects/MoreState.ts';
import type { BestState } from '../objects/BestState.ts';

const PAGE_SIZE = 12;
const MAX_OFFSET = 10000;

function loadError(error: unknown): string {
  if (error instanceof ApiError && (error.code === 'unauthorized' || error.kind === 'auth')) return '登录状态已失效，请重新登录后查看记录。';
  return '暂时无法读取挑战记录，请检查连接后重试。';
}

export function useHistory(token: SessionToken | undefined) {
  const { invalidate } = useSession();
  const invalidateRejectedToken = useCallback((error: unknown) => {
    if (token !== undefined && error instanceof ApiError && (error.code === 'unauthorized' || error.kind === 'auth')) invalidate(token);
  }, [token, invalidate]);
  const [history, setHistory] = useState<HistoryState>({ kind: 'loading' });
  const [more, setMore] = useState<MoreState>({ kind: 'idle' });
  const [best, setBest] = useState<BestState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [bestAttempt, setBestAttempt] = useState(0);
  const pageRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    pageRequest.current?.abort();
    pageRequest.current = null;
    setHistory({ kind: 'loading' });
    setMore({ kind: 'idle' });
    void new ListMyResultsAPI(0, PAGE_SIZE).send({ signal: controller.signal, token }).then(page => {
      if (!controller.signal.aborted) setHistory(page.items.length === 0 ? { kind: 'empty' } : { kind: 'ready', items: page.items, total: page.total, nextOffset: page.offset + page.items.length });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      invalidateRejectedToken(error);
      setHistory({ kind: 'failed', message: loadError(error) });
    });
    return () => { controller.abort(); pageRequest.current?.abort(); };
  }, [token, attempt, invalidateRejectedToken]);

  useEffect(() => {
    const controller = new AbortController();
    setBest({ kind: 'loading' });
    async function load() {
      try {
        const config = await new GetTrainingConfigAPI().send({ signal: controller.signal });
        const response = await new GetMyBestAPI(config.id, config.version, config.terrain).send({ signal: controller.signal, token });
        if (!controller.signal.aborted) setBest({ kind: 'ready', best: response.best, config });
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        invalidateRejectedToken(error);
        setBest({ kind: 'failed' });
      }
    }
    void load();
    return () => controller.abort();
  }, [token, attempt, bestAttempt, invalidateRejectedToken]);

  const loadMore = useCallback(async () => {
    if (history.kind !== 'ready' || history.nextOffset >= history.total || history.nextOffset > MAX_OFFSET || pageRequest.current !== null) return;
    const controller = new AbortController();
    pageRequest.current = controller;
    setMore({ kind: 'loading' });
    try {
      const page = await new ListMyResultsAPI(history.nextOffset, PAGE_SIZE).send({ signal: controller.signal, token });
      if (controller.signal.aborted) return;
      setHistory(current => {
        if (current.kind !== 'ready') return current;
        // A newly submitted run can shift offset pages. Never display a duplicate row.
        const seen = new Set(current.items.map(item => item.runId));
        const incoming = page.items.filter(item => !seen.has(item.runId));
        return { kind: 'ready', items: [...current.items, ...incoming], total: page.total,
          nextOffset: page.items.length === 0 ? page.total : page.offset + page.items.length };
      });
      setMore({ kind: 'idle' });
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      invalidateRejectedToken(error);
      setMore({ kind: 'failed', message: loadError(error) });
    } finally {
      if (pageRequest.current === controller) pageRequest.current = null;
    }
  }, [history, token, invalidateRejectedToken]);

  return { history, more, best, loadMore, refresh: () => setAttempt(value => value + 1),
    retryBest: () => setBestAttempt(value => value + 1),
    canLoadMore: history.kind === 'ready' && history.nextOffset < history.total && history.nextOffset <= MAX_OFFSET,
    reachedOffsetLimit: history.kind === 'ready' && history.nextOffset < history.total && history.nextOffset > MAX_OFFSET };
}
