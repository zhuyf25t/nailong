export type GameSound = 'shot' | 'hit' | 'countdown' | 'start' | 'explosion';

/** Small synthesized cues: no network audio assets and no ambient autoplay. */
export function createGameAudio(initialVolume: number) {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let volume = initialVolume;
  let disposed = false;
  let suspended = false;
  const sources = new Set<AudioScheduledSourceNode>();
  function unlock() {
    if (disposed) return;
    try {
      if (!context) { context = new AudioContext(); master = context.createGain(); master.gain.value = volume; master.connect(context.destination); }
      if (!suspended && context.state === 'suspended') void context.resume().catch(() => {});
    } catch { /* Audio support is optional; gameplay still works without it. */ }
  }
  function play(sound: GameSound) {
    if (!context || !master || context.state !== 'running' || suspended || disposed || volume === 0) return;
    const now = context.currentTime;
    const duration = sound === 'explosion' ? .48 : sound === 'start' ? .23 : sound === 'countdown' ? .11 : .075;
    const gain = context.createGain(); gain.connect(master);
    gain.gain.setValueAtTime(sound === 'explosion' ? .25 : .12, now);
    gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    let source: AudioScheduledSourceNode;
    if (sound === 'explosion') {
      const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
      const data = buffer.getChannelData(0);
      let previous = 0;
      for (let i = 0; i < data.length; i++) { previous = previous * .75 + (Math.random() * 2 - 1) * .25; data[i] = previous; }
      const noise = context.createBufferSource(); noise.buffer = buffer; source = noise;
    } else {
      const oscillator = context.createOscillator(); oscillator.type = sound === 'shot' ? 'triangle' : 'sine';
      const start = sound === 'shot' ? 900 : sound === 'hit' ? 560 : sound === 'start' ? 1047 : 698;
      oscillator.frequency.setValueAtTime(start, now); oscillator.frequency.exponentialRampToValueAtTime(sound === 'shot' ? 240 : start * 1.15, now + duration); source = oscillator;
    }
    source.connect(gain); sources.add(source);
    source.onended = () => { source.disconnect(); gain.disconnect(); sources.delete(source); };
    source.start(now); source.stop(now + duration);
  }
  return {
    unlock, play,
    setVolume(value: number) { volume = Math.max(0, Math.min(1, value)); if (master && context) master.gain.setTargetAtTime(volume, context.currentTime, .02); },
    setSuspended(value: boolean) { suspended = value; if (context) void (value ? context.suspend() : context.resume()).catch(() => {}); },
    dispose() {
      disposed = true;
      for (const source of sources) { source.onended = null; try { source.stop(); } catch {} source.disconnect(); }
      sources.clear(); master?.disconnect(); if (context) void context.close().catch(() => {}); context = null; master = null;
    },
  };
}
