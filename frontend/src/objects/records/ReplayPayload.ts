import { array, assert, object } from '../../system/api/decode.ts';
import { decodeReplayManifest, type ReplayManifest } from './ReplayManifest.ts';
import { decodeReplayFrame, type ReplayFrame } from './ReplayFrame.ts';
import { decodeRunEvent, type RunEvent } from './RunEvent.ts';
import { validateEventOrder } from './RunEventSummary.ts';
export interface ReplayPayload {
    readonly manifest: ReplayManifest;
    readonly frames: readonly ReplayFrame[];
    readonly events: readonly RunEvent[];
}
export function decodeReplayPayload(value: unknown, path = '$'): ReplayPayload {
    const v = object(value, path), manifest = decodeReplayManifest(v.manifest, path + '.manifest'), frames = array(v.frames, decodeReplayFrame, path + '.frames', 1, 12000), events = array(v.events, decodeRunEvent, path + '.events', 0, 10000), coverage = manifest.coverage;
    assert(frames[0].tMs === coverage.fromMs && frames[frames.length - 1].tMs === coverage.toMs, path, 'frames match coverage endpoints');
    validateEventOrder(events, path + '.events');
    assert(events.every(e => e.tMs >= coverage.fromMs && e.tMs <= coverage.toMs), path + '.events', 'events within coverage');
    const droneIds = new Set(manifest.world.drones.map(d => d.id)), gateIds = new Set(manifest.world.objects.filter(o => o.kind === 'gate').map(o => o.id)), eventsBySeq = new Map(events.map(e => [e.seq, e]));
    let eventCursor = 0, mandatorySeq = -1;
    for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        assert(f.tMs >= coverage.fromMs && f.tMs <= coverage.toMs, path, 'frame in coverage');
        assert(f.drones.length === droneIds.size && f.drones.every(d => droneIds.has(d.id)), path, 'complete known drone state');
        assert(f.world.openGateIds.every(id => gateIds.has(id)), path, 'known gate IDs');
        if (i) {
            assert(f.tMs > frames[i - 1].tMs, path, 'strict frame time');
            assert(f.scoreElapsedMs >= frames[i - 1].scoreElapsedMs, path, 'monotonic score clock');
            assert(f.throughEventSeq >= frames[i - 1].throughEventSeq, path, 'monotonic event anchor');
        }
        while (eventCursor < events.length && events[eventCursor].tMs < f.tMs) {
            mandatorySeq = events[eventCursor].seq;
            eventCursor++;
        }
        assert(f.throughEventSeq >= mandatorySeq, path, 'frame must include earlier events');
        let futureIndex = eventCursor;
        while (futureIndex < events.length && events[futureIndex].tMs === f.tMs)
            futureIndex++;
        const future = events[futureIndex];
        if (future)
            assert(f.throughEventSeq < future.seq, path, 'frame cannot include future event');
        if (events.length && f.throughEventSeq >= events[0].seq) {
            const anchor = eventsBySeq.get(f.throughEventSeq);
            assert(anchor !== undefined && anchor.tMs <= f.tMs, path, 'known event anchor');
        }
        if (events.length)
            assert(f.throughEventSeq <= events[events.length - 1].seq, path, 'event anchor bounded');
    }
    for (const e of events) {
        if (e.kind === 'drone-state' || e.kind === 'contact')
            assert(e.actorId !== null && droneIds.has(e.actorId), path + '.events', 'known drone actor');
        if (e.kind === 'hit' || e.kind === 'destroyed')
            assert(e.targetId !== null && droneIds.has(e.targetId), path + '.events', 'known drone target');
        if (e.kind === 'gate')
            assert(e.targetId !== null && gateIds.has(e.targetId), path + '.events', 'known gate');
        if (e.kind === 'beacon')
            assert(e.targetId === manifest.world.beacon.id, path + '.events', 'known beacon');
        if (e.kind === 'extract')
            assert(e.targetId === manifest.world.extraction.id, path + '.events', 'known extraction');
    }
    return { manifest, frames, events };
}
