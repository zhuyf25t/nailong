import type { ResultSubmission } from '../../../objects/records/ResultSubmission';

/** Finish freezes a submission; the visual clock delivers it once after the burst. */
export function createRoundCompletion(delaySeconds: number, onFinish: (result: ResultSubmission) => void) {
  let pending: ResultSubmission | null = null;
  let remaining = 0;
  let cancelled = false;
  let delivered = false;
  return {
    finish(result: ResultSubmission) {
      if (cancelled || pending || delivered) return false;
      pending = Object.freeze({ ...result }); remaining = delaySeconds; return true;
    },
    advance(seconds: number) {
      if (cancelled || delivered || !pending || !Number.isFinite(seconds) || seconds <= 0) return;
      remaining = Math.max(0, remaining - seconds);
      if (remaining <= 1e-9) { delivered = true; onFinish(pending); }
    },
    cancel() { cancelled = true; pending = null; },
  };
}
