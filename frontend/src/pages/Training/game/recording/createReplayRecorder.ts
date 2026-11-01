import type { TrainingConfig } from '../../../../objects/training/TrainingConfig.ts';
import type { RunId } from '../../../../objects/training/RunId.ts';
import type { WorldDefinition } from '../../../../objects/worlds/WorldDefinition.ts';
import { decodeReplayFrame, type ReplayFrame, type ReplayFrameInput } from '../../../../objects/records/ReplayFrame.ts';
import { decodeRunEvent, type RunEvent, type RunEventInput } from '../../../../objects/records/RunEvent.ts';
import { decodeRunEventSummary, type RunEventSummary } from '../../../../objects/records/RunEventSummary.ts';
import { decodeReplayPayload, type ReplayPayload } from '../../../../objects/records/ReplayPayload.ts';
import type { ReplayCoverage } from '../../../../objects/records/ReplayCoverage.ts';
import type { RecordedRun } from '../../../../objects/records/RecordedRun.ts';
import { replayContentHash } from '../../../../objects/records/ReplayEnvelope.ts';
import { MAX_RECORDING_MS, MAX_REPLAY_BYTES, MAX_REPLAY_HTTP_BYTES, utf8Bytes } from '../../../../objects/records/replayDecode.ts';

export interface ReplayRecorderOptions {
  runId: RunId | null; config: TrainingConfig; world: WorldDefinition;
  mapVersionId: string | null; missionId: string; assetVersion: 'garden-v1';
  /** Lower limits are injectable for boundary tests. Network hard limits remain enforced. */
  limits?: { payloadBytes?: number; maxFrames?: number; durationMs?: number; endingMs?: number; summaryBytes?: number; maxEvents?: number };
}
type FrameEntry = { frame: ReplayFrame; bytes: number };

/** An observer of real state. It never advances AI, input, collision, damage or a run. */
export function createReplayRecorder(options: ReplayRecorderOptions) {
  const metadata = structuredClone({ runId: options.runId, config: options.config, world: options.world,
    mapVersionId: options.mapVersionId, missionId: options.missionId, assetVersion: options.assetVersion });
  const limits = {
    payloadBytes: Math.min(MAX_REPLAY_BYTES, options.limits?.payloadBytes ?? 5 * 1024 * 1024),
    maxFrames: Math.min(12000, options.limits?.maxFrames ?? 12000),
    durationMs: Math.min(600000, options.limits?.durationMs ?? 600000),
    endingMs: Math.min(30000, options.limits?.endingMs ?? 30000),
    summaryBytes: Math.min(1024 * 1024, options.limits?.summaryBytes ?? 900 * 1024),
    maxEvents: Math.min(10000, options.limits?.maxEvents ?? 10000),
  };
  for (const value of Object.values(limits)) if (!Number.isFinite(value) || value <= 0) throw new RangeError('Invalid recording budget');
  let elapsed = 0, scoreElapsedMs = 0, sequence = -1;
  let eventBytes = 0, fullBytes = utf8Bytes(JSON.stringify(metadata)) + 1024;
  let full: FrameEntry[] = [], ending: FrameEntry[] = [], events: RunEvent[] = [];
  let reason: ReplayCoverage['reason'] = null, truncated = false, eventPending = false;
  let lastInput: ReplayFrameInput | null = null, lastSample = -Infinity;
  let previousObservation: ReplayFrame | null = null, olderObservation: ReplayFrame | null = null;
  let finished: Promise<RecordedRun> | null = null, disposed = false;
  const angles = new Map<string, { raw: number; continuous: number }>();
  const now = () => Math.round(elapsed);

  function switchToEnding(why: NonNullable<ReplayCoverage['reason']>) {
    reason ??= why; full = []; fullBytes = 0;
  }
  function unwrap(id: string, raw: number) {
    const previous = angles.get(id);
    const continuous = previous ? previous.continuous + Math.atan2(Math.sin(raw - previous.raw), Math.cos(raw - previous.raw)) : raw;
    angles.set(id, { raw, continuous }); return continuous;
  }
  function appendEvent(input: RunEventInput, at: number) {
    const entry = decodeRunEvent({ seq: ++sequence, tMs: at, kind: input.kind, actorId: input.actorId ?? null,
      targetId: input.targetId ?? null, position: input.position ?? null, value: input.value ?? null, detail: input.detail ?? null });
    if (events.length && entry.tMs < events[events.length - 1].tMs) throw new Error('Recording event time moved backwards');
    events.push(entry); eventBytes += utf8Bytes(JSON.stringify(entry)) + 1; eventPending = true;
    while (events.length > limits.maxEvents || eventBytes > limits.summaryBytes - 256) {
      if (events.length <= 1) throw new Error('A single event exceeds the recording budget');
      eventBytes -= utf8Bytes(JSON.stringify(events.shift()!)) + 1; truncated = true; switchToEnding('byte-limit');
    }
    return entry;
  }
  function advance(activeDeltaMs: number, scoreMs: number) {
    if (finished || disposed) return now();
    if (!Number.isFinite(activeDeltaMs) || activeDeltaMs < 0 || !Number.isFinite(scoreMs) || scoreMs < scoreElapsedMs)
      throw new RangeError('Recording requires nonnegative active time and a monotonic score clock');
    elapsed += activeDeltaMs; scoreElapsedMs = Math.round(scoreMs);
    if (elapsed > MAX_RECORDING_MS) throw new RangeError('Recording duration exceeded');
    if (now() > limits.durationMs) switchToEnding('duration-limit');
    return now();
  }
  function turned(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, c: { x: number; y: number; z: number }) {
    const ax = b.x - a.x, az = b.z - a.z, bx = c.x - b.x, bz = c.z - b.z;
    const previousDistance = Math.hypot(ax, az), distance = Math.hypot(bx, bz);
    if (previousDistance < .012) return false;
    if (distance < .001) return true;
    return (ax * bx + az * bz) / (previousDistance * distance) < Math.cos(Math.PI / 9);
  }
  function retain(frame: ReplayFrame) {
    const bytes = utf8Bytes(JSON.stringify(frame)) + 1, entry = { frame, bytes };
    if (ending.at(-1)?.frame.tMs === frame.tMs) ending[ending.length - 1] = entry; else ending.push(entry);
    while (ending.length > 1 && ending[0].frame.tMs < now() - limits.endingMs) ending.shift();
    if (reason === null) {
      if (full.at(-1)?.frame.tMs === frame.tMs) { fullBytes -= full.at(-1)!.bytes; full[full.length - 1] = entry; }
      else full.push(entry);
      fullBytes += bytes;
      if (full.length > limits.maxFrames) switchToEnding('frame-limit');
      else if (fullBytes + eventBytes > limits.payloadBytes) switchToEnding('byte-limit');
    }
    lastSample = frame.tMs;
  }
  function capture(input: ReplayFrameInput, captureOptions: { force?: boolean; critical?: boolean; continuousYaw?: boolean } = {}) {
    if (finished || disposed) return false;
    // Observe angles at rendering frequency, even when this particular frame is not retained.
    lastInput = { ...input, player: { ...input.player, yaw: captureOptions.continuousYaw ? input.player.yaw : unwrap('player', input.player.yaw) },
      drones: input.drones.map(drone => ({ ...drone, yaw: captureOptions.continuousYaw ? drone.yaw : unwrap(drone.id, drone.yaw) })) };
    const frame = decodeReplayFrame({ ...lastInput, tMs: now(), scoreElapsedMs, throughEventSeq: sequence });
    const previous = previousObservation, older = olderObservation;
    const transition = previous !== null && ((frame.player.animation === 'jump') !== (previous.player.animation === 'jump') || frame.player.alive !== previous.player.alive ||
      frame.drones.some(drone => { const old = previous.drones.find(item => item.id === drone.id); return old && (old.stunned !== drone.stunned || old.state !== drone.state || old.hp !== drone.hp); }));
    const corner = previous !== null && older !== null && (turned(older.player.position, previous.player.position, frame.player.position) ||
      frame.drones.some(drone => { const before = older.drones.find(item => item.id === drone.id), middle = previous.drones.find(item => item.id === drone.id); return before && middle && turned(before.position, middle.position, drone.position); }));
    if (!previous || frame.tMs > previous.tMs) { olderObservation = previous; previousObservation = frame; }
    else previousObservation = frame;
    const critical = captureOptions.critical || input.drones.some(drone => drone.state === 'locked') || !input.player.alive;
    const interval = critical ? 1000 / 30 : 100;
    if (!captureOptions.force && !eventPending && !transition && !corner && now() - lastSample < interval) return false;
    if (lastSample === -Infinity && now() !== 0) throw new Error('Capture the initial state at active time zero');
    // Preserve observed positions on both sides of a corner/landing instead of drawing a shortcut.
    if ((transition || corner) && previous && previous.tMs > lastSample && previous.tMs < frame.tMs) retain(previous);
    retain(frame); eventPending = false; return true;
  }
  function event(input: RunEventInput) {
    if (finished || disposed) throw new Error('The recording has already ended');
    return appendEvent(input, now());
  }
  function finish(result: { resultAtMs: number; outcome: 'victory' | 'defeat' }): Promise<RecordedRun> {
    if (finished) return finished;
    if (disposed) return Promise.reject(new Error('The recording was disposed'));
    if (!lastInput) return Promise.reject(new Error('There is no recorded initial state'));
    if (!Number.isSafeInteger(result.resultAtMs) || result.resultAtMs < 0 || result.resultAtMs > now() || now() - result.resultAtMs > 1200)
      return Promise.reject(new Error('The result and visual tail clocks do not agree'));
    const roundEnd = events.find(entry => entry.kind === 'round-end');
    if (roundEnd && (roundEnd.tMs !== result.resultAtMs || roundEnd.detail !== result.outcome))
      return Promise.reject(new Error('Recorded outcome differs from the final result'));
    if (!roundEnd) appendEvent({ kind: 'round-end', actorId: 'player', detail: result.outcome }, result.resultAtMs);
    // Freeze the score at the actual outcome; preserve a separate clock for the explosion tail.
    scoreElapsedMs = result.resultAtMs;
    capture(lastInput, { force: true, continuousYaw: true });
    const allFrames = (reason === null ? full : ending).map(entry => entry.frame);
    const allEvents = events.slice();
    const summary = decodeRunEventSummary({ formatVersion: 1, runDurationMs: now(), resultAtMs: result.resultAtMs, truncated, events: allEvents });
    finished = (async () => {
      let selected = allFrames, actualReason = reason;
      let payload: ReplayPayload, payloadJson: string;
      for (;;) {
        const fromMs = selected[0]?.tMs;
        if (fromMs === undefined) throw new Error('The recording contains no complete state');
        const coverage: ReplayCoverage = { kind: actualReason === null ? 'complete' : 'ending-clip', reason: actualReason,
          fromMs, toMs: now(), runDurationMs: now(), resultAtMs: result.resultAtMs };
        payload = { manifest: { ...metadata, formatVersion: 1, sampleHz: 10, coverage }, frames: selected,
          events: allEvents.filter(entry => entry.tMs >= fromMs && entry.tMs <= coverage.toMs) };
        payloadJson = JSON.stringify(payload);
        const wireBytes = utf8Bytes(JSON.stringify({ runId: metadata.runId, replay: { contentHash: '0'.repeat(64), payloadJson }, userToken: '0'.repeat(4096) }));
        if (utf8Bytes(payloadJson) <= limits.payloadBytes && wireBytes <= MAX_REPLAY_HTTP_BYTES && selected.length <= limits.maxFrames) break;
        actualReason ??= 'byte-limit';
        const cutoff = Math.max(selected[0].tMs + 1, now() - Math.min(limits.endingMs, Math.max(1, (now() - selected[0].tMs) / 2)));
        const next = selected.findIndex(frame => frame.tMs >= cutoff && frame.tMs <= result.resultAtMs);
        if (next <= 0) throw new Error('The ending state exceeds the recording budget');
        selected = selected.slice(next);
      }
      decodeReplayPayload(payload);
      const recorded: RecordedRun = { summary, replay: { contentHash: await replayContentHash(payloadJson), payloadJson } };
      return recorded;
    })();
    return finished;
  }
  return { advance, event, capture, finish,
    get elapsedMs() { return now(); }, get lastEventSeq() { return sequence; },
    get mode() { return reason === null ? 'complete' as const : 'ending-clip' as const; },
    get retainedFrameCount() { return reason === null ? full.length : ending.length; },
    getSummary(resultAtMs: number): RunEventSummary { return decodeRunEventSummary({ formatVersion: 1, runDurationMs: now(), resultAtMs, truncated, events: events.slice() }); },
    dispose() { disposed = true; full = []; ending = []; events = []; angles.clear(); lastInput = null; previousObservation = null; olderObservation = null; },
  };
}
