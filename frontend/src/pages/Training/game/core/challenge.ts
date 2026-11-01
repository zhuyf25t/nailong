export type RoundPhase = 'practice' | 'countdown' | 'playing' | 'results';
export type RoundOutcome = 'victory' | 'defeat' | 'timeout';
export interface RoundState { phase: RoundPhase; outcome: RoundOutcome | null; remaining: number; countdown: number; elapsed: number; hits: number; shots: number; destroyed: number }
export interface RoundResult { hits: number; shots: number; accuracy: number; score: number }
export interface ChallengeOptions { mode?: 'timed' | 'elimination' | 'objective'; targetCount?: number }

/** Time is supplied by the app's active clock. Pausing means no advance call. */
export function createChallenge({ mode = 'timed', targetCount = 4 }: ChallengeOptions = {}) {
  if (!Number.isSafeInteger(targetCount) || targetCount < 1) throw new RangeError('targetCount must be a positive safe integer');
  const initialRemaining = mode === 'timed' ? 30 : Infinity;
  const destroyedIds = new Set<number>();
  const state: RoundState = { phase: 'practice', outcome: null, remaining: initialRemaining, countdown: 0, elapsed: 0, hits: 0, shots: 0, destroyed: 0 };
  function reset(challenge = false) {
    destroyedIds.clear();
    Object.assign(state, { phase: challenge ? 'countdown' : 'practice', outcome: null, remaining: initialRemaining, countdown: challenge ? 3 : 0, elapsed: 0, hits: 0, shots: 0, destroyed: 0 });
  }
  function advance(seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0) return false;
    let rest = seconds;
    if (state.phase === 'countdown') {
      const used = Math.min(rest, state.countdown);
      state.countdown -= used; rest -= used;
      if (state.countdown <= 0) state.phase = 'playing';
    }
    if (state.phase === 'practice') state.elapsed += rest;
    if (state.phase === 'playing') {
      state.elapsed += mode === 'timed' ? Math.min(rest, state.remaining) : rest;
      if (mode !== 'timed') return false;
      state.remaining = Math.max(0, state.remaining - rest);
      if (state.remaining === 0) { state.phase = 'results'; state.outcome = 'timeout'; return true; }
    }
    return false;
  }
  const acceptsHits = () => state.phase === 'practice' || state.phase === 'playing';
  /** Zero-based target IDs; only the final distinct kill completes elimination. */
  function destroy(id: number) {
    if (!acceptsHits() || !Number.isInteger(id) || id < 0 || id >= targetCount || destroyedIds.has(id)) return false;
    destroyedIds.add(id);
    state.destroyed = destroyedIds.size;
    if (mode === 'elimination' && state.destroyed === targetCount) {
      state.phase = 'results';
      state.outcome = 'victory';
      return true;
    }
    return false;
  }
  return {
    state, reset, advance, destroy,
    complete() {
      if (!acceptsHits()) return false;
      state.phase = 'results'; state.outcome = 'victory'; return true;
    },
    fail() {
      if (!acceptsHits()) return false;
      state.phase = 'results'; state.outcome = 'defeat'; return true;
    },
    shot() { if (acceptsHits()) state.shots++; },
    hit() { if (acceptsHits()) state.hits++; },
    result(): RoundResult { return { hits: state.hits, shots: state.shots, accuracy: state.shots ? Math.round(state.hits / state.shots * 100) : 0, score: state.hits * 100 }; },
  };
}
