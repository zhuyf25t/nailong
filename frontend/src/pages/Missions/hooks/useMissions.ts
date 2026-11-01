import { useEffect, useState } from 'react';
import { ListMissionsAPI } from '../../../apis/training/ListMissionsAPI.ts';
import type { MissionsState } from '../objects/MissionsState.ts';

export function useMissions() {
  const [state, setState] = useState<MissionsState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    void new ListMissionsAPI().send({ signal: controller.signal }).then(({ missions }) => {
      if (controller.signal.aborted) return;
      const ordered = [...missions].sort((first, second) => Number(second.id === 'forest-beacon') - Number(first.id === 'forest-beacon'));
      setState(ordered.length === 0 ? { kind: 'empty' } : { kind: 'ready', missions: ordered });
    }).catch(() => { if (!controller.signal.aborted) setState({ kind: 'failed' }); });
    return () => controller.abort();
  }, [attempt]);
  return { state, retry: () => setAttempt(value => value + 1) };
}
