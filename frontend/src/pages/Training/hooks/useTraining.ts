import { useCallback, useEffect, useRef, useState } from 'react';
import { GetTrainingConfigAPI } from '../../../apis/training/GetTrainingConfigAPI';
import { StartTrainingRunAPI } from '../../../apis/training/StartTrainingRunAPI';
import { AbandonTrainingRunAPI } from '../../../apis/training/AbandonTrainingRunAPI';
import type { TerrainConfig } from '../../../objects/training/TerrainConfig';
import { decodeResultSubmission, type ResultSubmission } from '../../../objects/records/ResultSubmission';
import { useSession } from '../../../system/session/SessionProvider';
import { usePendingResults } from '../../../system/results/PendingResultsProvider';
import { ApiError } from '../../../system/api/ApiError';
import type { Preparation } from '../objects/Preparation';
import type { ActiveTraining } from '../objects/ActiveTraining';
import { PRACTICE_CONFIG } from '../functions/practiceConfig';

export function useTraining(practice: boolean) {
  const { state: session, invalidate } = useSession();
  const queue = usePendingResults();
  const [preparation, setPreparation] = useState<Preparation>({ kind: 'loading' });
  const [reload, setReload] = useState(0);
  const [active, setActive] = useState<ActiveTraining | null>(null);
  const [finished, setFinished] = useState<ResultSubmission | null>(null);
  const [resultHandedOff, setResultHandedOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const finishedOnce = useRef(false);
  const requestId = useRef(crypto.randomUUID());
  const mounted = useRef(true);
  const saveState = resultHandedOff && active?.run ? queue.getStatus(active.run.playerId, active.run.id) : undefined;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!finished || !active?.run || saveState?.status === 'saved' || (saveState && !queue.storageWarning)) return;
    const preserve = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', preserve);
    return () => window.removeEventListener('beforeunload', preserve);
  }, [finished, active, saveState, queue.storageWarning]);

  useEffect(() => {
    if (practice) {
      setPreparation({ kind: 'ready', config: PRACTICE_CONFIG, terrain: { ...PRACTICE_CONFIG.terrain } });
      return;
    }
    const controller = new AbortController();
    setPreparation({ kind: 'loading' });
    new GetTrainingConfigAPI().send({ signal: controller.signal }).then(config => {
      setPreparation({ kind: 'ready', config, terrain: { ...config.terrain } });
      requestId.current = crypto.randomUUID();
    }).catch(reason => {
      if (!controller.signal.aborted) setPreparation({ kind: 'error', message: reason instanceof Error ? reason.message : '暂时无法准备花谷，请重试。' });
    });
    return () => controller.abort();
  }, [reload, practice]);

  const setTerrain = (terrain: TerrainConfig) => {
    if (busy) return;
    setPreparation(current => current.kind === 'ready' ? { ...current, terrain } : current);
    requestId.current = crypto.randomUUID();
  };
  const start = async () => {
    if (lock.current || preparation.kind !== 'ready') return;
    if (!practice && session.kind !== 'signed-in') { setError('请先登录，再创建正式挑战。'); return; }
    lock.current = true; setBusy(true); setError(null);
    try {
      if (practice) {
        setActive({ config: preparation.config, terrain: preparation.terrain, run: null, token: null, key: crypto.randomUUID() });
      } else if (session.kind === 'signed-in') {
        const token = session.token;
        const run = await new StartTrainingRunAPI(requestId.current, preparation.config.id, preparation.config.version, preparation.terrain).send({ token });
        if (!mounted.current) { void new AbandonTrainingRunAPI(run.id).send({ token }).catch(() => {}); return; }
        if (run.playerId !== session.player.id || run.status !== 'open') throw new Error('这次行动已被使用，请重新准备。');
        setActive({ config: run.config, terrain: run.terrain, run, token, key: run.id });
      }
      finishedOnce.current = false; setFinished(null); setResultHandedOff(false);
    } catch (reason) {
      if (session.kind === 'signed-in' && reason instanceof ApiError && (reason.code === 'unauthorized' || reason.kind === 'auth')) invalidate(session.token);
      if (mounted.current) setError(reason instanceof ApiError && reason.code === 'conflict' ? '规则或局次发生变化。请重新获取规则，再开始挑战。' : reason instanceof Error ? reason.message : '创建行动失败，请重试。');
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  const finish = useCallback((submission: ResultSubmission) => {
    if (!active || finishedOnce.current) return;
    const frozen = Object.freeze(decodeResultSubmission(submission));
    finishedOnce.current = true; setFinished(frozen); setResultHandedOff(false);
    if (active.run && active.token) {
      try {
        const item = queue.enqueue({ playerId: active.run.playerId, runId: active.run.id, submission: frozen });
        setResultHandedOff(true);
        void queue.retry(item, { playerId: active.run.playerId, token: active.token });
      } catch (reason) { setError(reason instanceof Error ? reason.message : '暂时无法保存结果，请保留这个页面后重试。'); }
    }
  }, [active, queue.enqueue, queue.retry]);
  const retrySave = () => {
    if (!active?.run || !finished) return;
    if (session.kind !== 'signed-in' || session.player.id !== active.run.playerId) {
      setError('请使用本局开始时的账号登录，再保存这次结果。'); return;
    }
    try {
      const item = queue.enqueue({ playerId: active.run.playerId, runId: active.run.id, submission: finished });
      setResultHandedOff(true);
      setError(null); void queue.retry(item, { playerId: session.player.id, token: session.token });
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存暂时不可用'); }
  };
  const abandon = async (): Promise<boolean> => {
    if (lock.current) return false;
    if (!active?.run || finished) return true;
    if (session.kind !== 'signed-in' || session.player.id !== active.run.playerId) {
      setError('请使用本局开始时的账号重新登录，再放弃这次行动。'); return false;
    }
    const abandonToken = session.token;
    lock.current = true; setBusy(true); setError(null);
    try {
      await new AbandonTrainingRunAPI(active.run.id).send({ token: abandonToken });
      return true;
    } catch (reason) {
      if (reason instanceof ApiError && (reason.code === 'unauthorized' || reason.kind === 'auth')) invalidate(abandonToken);
      setError(reason instanceof Error ? reason.message : '无法标记本局为放弃，请联网后重试。'); return false;
    }
    finally { lock.current = false; setBusy(false); }
  };
  const again = () => {
    setActive(null); setFinished(null); setResultHandedOff(false); setError(null); finishedOnce.current = false;
    requestId.current = crypto.randomUUID();
  };
  return { preparation, setTerrain, active, finished, resultHandedOff, busy, error, start, finish, retrySave, abandon, again,
    reload: () => setReload(value => value + 1),
    saveState,
    storageWarning: queue.storageWarning,
  };
}
