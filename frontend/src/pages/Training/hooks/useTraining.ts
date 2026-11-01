import { useCallback, useEffect, useRef, useState } from 'react';
import { GetTrainingConfigAPI } from '../../../apis/training/GetTrainingConfigAPI';
import { StartTrainingRunAPI } from '../../../apis/training/StartTrainingRunAPI';
import { AbandonTrainingRunAPI } from '../../../apis/training/AbandonTrainingRunAPI';
import { GetTrainingRunAPI } from '../../../apis/training/GetTrainingRunAPI';
import { GetMissionAPI } from '../../../apis/training/GetMissionAPI';
import { GetMapVersionAPI } from '../../../apis/worlds/GetMapVersionAPI';
import { getBuiltinSetup, builtinMaps } from '../../../objects/training/builtinCatalog';
import { decodeRunSetup } from '../../../objects/training/RunSetup';
import { trainingRequest } from '../functions/trainingRequest';
import type { RecordedRun } from '../../../objects/records/RecordedRun';
import { useReplays } from '../../../system/replays/ReplaysProvider';
import type { TerrainConfig } from '../../../objects/training/TerrainConfig';
import { decodeResultSubmission, type ResultSubmission } from '../../../objects/records/ResultSubmission';
import { useSession } from '../../../system/session/SessionProvider';
import { usePendingResults } from '../../../system/results/PendingResultsProvider';
import { ApiError } from '../../../system/api/ApiError';
import type { Preparation } from '../objects/Preparation';
import type { ActiveTraining } from '../objects/ActiveTraining';
import { PRACTICE_CONFIG } from '../functions/practiceConfig';

export function useTraining(practice: boolean, search = '') {
  const { state: session, invalidate } = useSession();
  const queue = usePendingResults();
  const replays = useReplays();
  const recording = useRef<RecordedRun | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [recordingPending, setRecordingPending] = useState(false);
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
  const preparationOwner = session.kind === 'signed-in' ? session.player.id : null;
  const preparationToken = session.kind === 'signed-in' ? session.token : undefined;
  const saveState = resultHandedOff && active?.run ? queue.getStatus(active.run.playerId, active.run.id) : undefined;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!recordingPending && (!finished || !active?.run || saveState?.status === 'saved' || (saveState && !queue.storageWarning))) return;
    const preserve = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', preserve);
    return () => window.removeEventListener('beforeunload', preserve);
  }, [finished, active, saveState, queue.storageWarning, recordingPending]);

  useEffect(() => {
    const controller = new AbortController();
    if (active) return;
    setPreparation({ kind: 'loading' });
    const load = async (): Promise<Preparation> => {
      const request = trainingRequest(search);
      const send = { signal: controller.signal, token: preparationToken };
      if (request.retryRunId && !practice) {
        const run = await new GetTrainingRunAPI(request.retryRunId).send(send);
        if (run.playerId !== preparationOwner) throw new Error('这局不属于当前账号。');
        const setup = run.setup ?? undefined;
        return { kind: 'ready', config: run.config, terrain: run.terrain, setup,
          selection: setup ? { missionId: setup.mission.id, mapVersionId: setup.mapVersionId, loadout: setup.loadout } : undefined };
      }
      if (practice && (!request.mapVersionId || builtinMaps.some(map => map.id === request.mapVersionId))) {
        const setup = getBuiltinSetup(request.missionId, request.tool, request.mapVersionId);
        return { kind: 'ready', config: PRACTICE_CONFIG, terrain: setup.world.terrain, setup };
      }
      const [config, mission] = await Promise.all([
        practice ? Promise.resolve(PRACTICE_CONFIG) : new GetTrainingConfigAPI().send(send),
        new GetMissionAPI(request.missionId).send(send),
      ]);
      const map = await new GetMapVersionAPI(request.mapVersionId ?? mission.mapVersionId).send(send);
      const objective = mission.objective.kind === 'activate_extract'
        ? { kind: 'activate_extract', beaconId: map.world.beacon.id, extractionId: map.world.extraction.id } : mission.objective;
      const setup = decodeRunSetup({ mission: { ...mission, objective }, world: map.world, mapVersionId: map.id,
        loadout: { tool: request.tool }, seed: 104729, assetVersion: 'garden-v1' });
      return { kind: 'ready', config, terrain: map.world.terrain, setup,
        selection: { missionId: mission.id, mapVersionId: map.id, loadout: setup.loadout } };
    };
    void load().then(value => {
      if (!controller.signal.aborted) { setPreparation(value); requestId.current = crypto.randomUUID(); }
    }).catch(reason => {
      if (!controller.signal.aborted) setPreparation({ kind: 'error', message: reason instanceof Error ? reason.message : '暂时无法准备花谷，请重试。' });
    });
    return () => controller.abort();
  }, [reload, practice, search, preparationOwner, preparationToken, active]);

  const setTerrain = (terrain: TerrainConfig) => {
    if (busy || (preparation.kind === 'ready' && preparation.setup)) return;
    setPreparation(current => current.kind === 'ready' ? { ...current, terrain } : current);
    requestId.current = crypto.randomUUID();
  };
  const start = async () => {
    if (lock.current || preparation.kind !== 'ready') return;
    if (!practice && session.kind !== 'signed-in') { setError('请先登录，再创建正式挑战。'); return; }
    lock.current = true; setBusy(true); setError(null);
    try {
      if (practice) {
        setActive({ config: preparation.config, terrain: preparation.terrain, setup: preparation.setup, run: null, token: null, key: crypto.randomUUID() });
      } else if (session.kind === 'signed-in') {
        const token = session.token;
        const run = await new StartTrainingRunAPI(requestId.current, preparation.config.id, preparation.config.version, preparation.terrain, preparation.selection).send({ token });
        if (!mounted.current) { void new AbandonTrainingRunAPI(run.id).send({ token }).catch(() => {}); return; }
        if (run.playerId !== session.player.id || run.status !== 'open') throw new Error('这次行动已被使用，请重新准备。');
        setActive({ config: run.config, terrain: run.terrain, setup: run.setup ?? undefined, run, token, key: run.id });
      }
      finishedOnce.current = false; setFinished(null); setResultHandedOff(false);
      recording.current = null; setRecordingError(null); setRecordingPending(false);
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
        void queue.retry(item, { playerId: active.run.playerId, token: active.token }).then(() => replays.retry(active.run!.id));
      } catch (reason) { setError(reason instanceof Error ? reason.message : '暂时无法保存结果，请保留这个页面后重试。'); }
      const recorded = recording.current;
      if (recorded) {
        setRecordingPending(true);
        void replays.enqueue(active.run.playerId, active.run.id, recorded).catch(reason => {
          if (mounted.current) setRecordingError(reason instanceof Error ? reason.message : '回放尚未暂存，请保留页面后重试。');
        }).finally(() => { if (mounted.current) setRecordingPending(false); });
      }
    }
  }, [active, queue.enqueue, queue.retry, replays.enqueue, replays.retry]);
  const receiveRecording = useCallback((value: RecordedRun) => { recording.current = value; }, []);
  const retryRecording = async () => {
    if (!active?.run) return;
    if (!recording.current && !replays.getStatus(active.run.playerId, active.run.id)) {
      setRecordingError('本局未能生成可上传的过程记录，无法从成绩重建录像；成绩仍可独立保存。');
      return;
    }
    setRecordingError(null); setRecordingPending(true);
    try {
      if (recording.current) await replays.enqueue(active.run.playerId, active.run.id, recording.current);
      await replays.retry(active.run.id);
    } catch (reason) { setRecordingError(reason instanceof Error ? reason.message : '回放暂时无法保存。'); }
    finally { setRecordingPending(false); }
  };
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
    recording.current = null; setRecordingError(null); setRecordingPending(false);
    requestId.current = crypto.randomUUID();
  };
  return { preparation, setTerrain, active, finished, resultHandedOff, busy, error, start, finish, retrySave, abandon, again,
    reload: () => setReload(value => value + 1),
    saveState,
    storageWarning: queue.storageWarning,
    receiveRecording, recordingError, setRecordingError, recordingPending, retryRecording,
    canRetryRecording: recording.current !== null,
    replayState: active?.run ? replays.getStatus(active.run.playerId, active.run.id) : undefined,
    replayStorageWarning: replays.storageWarning,
  };
}
