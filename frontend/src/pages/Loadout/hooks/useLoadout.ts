import { useEffect, useState } from 'react';
import { GetMissionAPI } from '../../../apis/training/GetMissionAPI.ts';
import { GetMapVersionAPI } from '../../../apis/worlds/GetMapVersionAPI.ts';
import { builtinMaps } from '../../../objects/training/builtinCatalog.ts';
import { ApiError } from '../../../system/api/ApiError.ts';
import { useSession } from '../../../system/session/SessionProvider.tsx';
import type { LoadoutLocation } from '../objects/LoadoutLocation.ts';
import type { LoadoutState } from '../objects/LoadoutState.ts';

export function useLoadout(selection: LoadoutLocation) {
  const { state: session, invalidate } = useSession();
  const token = session.kind === 'signed-in' ? session.token : undefined;
  const missionId = selection.kind === 'valid' ? selection.missionId : undefined;
  const mapVersionId = selection.kind === 'valid' ? selection.mapVersionId : undefined;
  const [state, setState] = useState<LoadoutState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (missionId === undefined) return;
    const activeMissionId = missionId;
    const controller = new AbortController();
    setState({ kind: 'loading' });
    async function load() {
      let resource: 'mission' | 'map' = 'mission';
      try {
        const mission = await new GetMissionAPI(activeMissionId).send({ signal: controller.signal });
        if (controller.signal.aborted) return;
        const chosenMap = mapVersionId ?? mission.mapVersionId;
        const bundled = builtinMaps.find(map => map.id === chosenMap);
        if (bundled !== undefined) { setState({ kind: 'ready', mission, map: bundled }); return; }
        if (token === undefined) { setState({ kind: 'auth-required' }); return; }
        resource = 'map';
        const map = await new GetMapVersionAPI(chosenMap).send({ signal: controller.signal, token });
        if (!controller.signal.aborted) setState({ kind: 'ready', mission, map });
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && (error.kind === 'auth' || error.code === 'unauthorized')) {
          if (token !== undefined) invalidate(token);
          setState({ kind: 'auth-required' });
        } else if (error instanceof ApiError && (error.code === 'not_found' || error.code === 'forbidden')) {
          setState({ kind: 'not-found', message: resource === 'mission' ? '这项任务不存在，或已经不再开放。' : '这个地图版本不存在，或不属于当前登录的账号。' });
        } else setState({ kind: 'failed' });
      }
    }
    void load();
    return () => controller.abort();
  }, [missionId, mapVersionId, token, invalidate, attempt]);
  return { state, retry: () => setAttempt(value => value + 1) };
}
