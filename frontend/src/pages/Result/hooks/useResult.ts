import { useEffect, useState } from 'react';
import { GetTrainingResultAPI } from '../../../apis/records/GetTrainingResultAPI.ts';
import { GetTrainingRunAPI } from '../../../apis/training/GetTrainingRunAPI.ts';
import { parseRunId } from '../../../objects/training/RunId.ts';
import type { SessionToken } from '../../../objects/system/SessionToken.ts';
import { ApiError } from '../../../system/api/ApiError.ts';
import { useSession } from '../../../system/session/SessionProvider.tsx';
import type { ResultPageState } from '../objects/ResultPageState.ts';

export function useResult(rawRunId: string | undefined, token: SessionToken | undefined) {
  const { invalidate } = useSession();
  const [state, setState] = useState<ResultPageState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    async function load() {
      let runId;
      try { runId = parseRunId(rawRunId); }
      catch { setState({ kind: 'invalid' }); return; }
      try {
        const { result } = await new GetTrainingResultAPI(runId).send({ signal: controller.signal, token });
        if (controller.signal.aborted) return;
        if (result !== null) { setState({ kind: 'saved', result }); return; }
        const run = await new GetTrainingRunAPI(runId).send({ signal: controller.signal, token });
        if (!controller.signal.aborted) setState({ kind: 'unsubmitted', run });
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        if (token !== undefined && error instanceof ApiError && (error.code === 'unauthorized' || error.kind === 'auth')) invalidate(token);
        if (error instanceof ApiError && (error.code === 'not_found' || error.code === 'forbidden')) {
          setState({ kind: 'not-found' });
        } else {
          setState({ kind: 'failed', message: error instanceof ApiError && (error.code === 'unauthorized' || error.kind === 'auth')
            ? '登录状态已失效，请重新登录后查看这条记录。'
            : '暂时无法读取这条记录，请检查连接后重试。' });
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [rawRunId, token, attempt, invalidate]);
  return { state, retry: () => setAttempt(value => value + 1) };
}
