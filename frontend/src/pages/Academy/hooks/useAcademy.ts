import { useCallback, useRef, useState } from 'react';
import { getBuiltinSetup } from '../../../objects/training/builtinCatalog';
import type { ResultSubmission } from '../../../objects/records/ResultSubmission';
import type { LessonProgress } from '../../Training/game/core/lesson';
import type { ActiveLesson } from '../objects/ActiveLesson';
import type { LessonSelection } from '../objects/LessonSelection';

const initialProgress = (): LessonProgress => ({ elapsedSeconds: 0, status: 'ready', beaconActivated: false, toolUsed: false, toolEffective: false, escapedDetection: false });
export function useAcademy() {
  const [active, setActive] = useState<ActiveLesson | null>(null);
  const [progress, setProgress] = useState<LessonProgress>(initialProgress);
  const [result, setResult] = useState<ResultSubmission | null>(null);
  const [ready, setReady] = useState(false);
  const delivered = useRef(false);
  const start = (selection: LessonSelection) => {
    const setup = getBuiltinSetup('forest-beacon', selection.kind === 'cover' ? 'none' : selection.tool);
    delivered.current = false; setReady(false); setResult(null); setProgress(initialProgress());
    setActive({ key: crypto.randomUUID(), setup, options: { kind: selection.kind, durationSeconds: 30 } });
  };
  const finish = useCallback((submission: ResultSubmission) => {
    if (delivered.current) return;
    delivered.current = true;
    setResult(Object.freeze({ ...submission }));
  }, []);
  const restart = () => { if (active) start({ kind: active.options.kind, tool: active.setup.loadout.tool }); };
  const exit = () => { setActive(null); setResult(null); delivered.current = false; setProgress(initialProgress()); };
  return { active, progress, result, ready, start, restart, finish, exit, onReady: () => setReady(true), onProgress: setProgress };
}
