// Tiny Web Audio synth shared by the glass and the game. Everything is
// generated — no audio files to download.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = (() => {
  try {
    return localStorage.getItem('egg-muted') === '1';
  } catch {
    return false;
  }
})();

function audio(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** Construct the context ahead of time: on some machines that alone takes a
 * few hundred ms, which shouldn't land on the click that cracks the glass. */
export function warmAudio() {
  const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 50));
  idle(() => audio());
}

export const isMuted = () => muted;

export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem('egg-muted', value ? '1' : '0');
  } catch {}
  if (master) master.gain.value = value ? 0 : 0.22;
}

function noise(ac: AudioContext) {
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  return src;
}

/** Filtered noise burst — cracks, hits, explosions. */
export function burst(dur: number, freq: number, gain = 0.6, type: BiquadFilterType = 'highpass') {
  const ac = audio();
  if (!ac || !master) return;
  const t = ac.currentTime;
  const src = noise(ac);
  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t, Math.random() * 0.5, dur);
}

/** Pitched blip with an optional slide — jumps, shots, pickups. */
export function tone(from: number, to: number, dur: number, gain = 0.25, type: OscillatorType = 'square', delay = 0) {
  const ac = audio();
  if (!ac || !master) return;
  const t = ac.currentTime + delay;
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}
