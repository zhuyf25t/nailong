import { useEffect, useRef } from 'react';
import type { TrainingConfig } from '../../../objects/training/TrainingConfig';
import type { TerrainConfig } from '../../../objects/training/TerrainConfig';
import type { ResultSubmission } from '../../../objects/records/ResultSubmission';
import type { GameSettings } from '../../../system/settings/GameSettings';
import { mountGame, type GameHandle } from '../game/mountGame';
import type { RunSetup } from '../../../objects/training/RunSetup';
import type { RunId } from '../../../objects/training/RunId';
import type { LessonOptions, LessonProgress } from '../game/core/lesson';
import type { RecordedRun } from '../../../objects/records/RecordedRun';

export interface GameViewProps {
  config: TrainingConfig;
  terrain: TerrainConfig;
  settings: GameSettings;
  practice?: boolean;
  suspended?: boolean;
  setup?: RunSetup | null;
  runId?: RunId | null;
  lesson?: LessonOptions;
  onLessonProgress?(progress: LessonProgress): void;
  onRecording?(recording: RecordedRun): void;
  onRecordingError?(message: string): void;
  onFinish(submission: ResultSubmission): void;
  onExit(): void;
  onReady?(): void;
}

/** React owns navigation and persisted records; Three.js owns the active frame. */
export function GameView(props: GameViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<GameHandle | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const { config, terrain, practice = false, setup, runId, lesson } = props;
  useEffect(() => {
    if (!host.current) return;
    const mounted = mountGame(host.current, {
      config, terrain, practice, setup, runId, lesson,
      settings: latest.current.settings, suspended: latest.current.suspended,
      onFinish: result => latest.current.onFinish(result),
      onExit: () => latest.current.onExit(),
      onReady: () => latest.current.onReady?.(),
      onLessonProgress: progress => latest.current.onLessonProgress?.(progress),
      onRecording: latest.current.onRecording ? recording => latest.current.onRecording?.(recording) : undefined,
      onRecordingError: message => latest.current.onRecordingError?.(message),
    });
    handle.current = mounted;
    return () => { mounted.destroy(); if (handle.current === mounted) handle.current = null; };
  }, [config, terrain, practice, setup, runId, lesson]);
  useEffect(() => { handle.current?.setSettings(props.settings); }, [props.settings]);
  useEffect(() => { handle.current?.setSuspended(props.suspended ?? false); }, [props.suspended]);
  return <div ref={host} className="game-view" style={{ width: '100%', height: '100%', minHeight: '360px' }} />;
}

export default GameView;
