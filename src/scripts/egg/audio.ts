// Tiny synth shared by the glass and the game. Everything is generated — no
// audio files to download.
//
// Sounds are rendered with an OfflineAudioContext and played through plain
// <audio> elements. A live AudioContext would be simpler, but the first one on
// a page opens the audio device and blocks the main thread for most of a
// second (measured ~750ms in Chrome on macOS) — right as the glass cracks.
// Offline rendering takes a few ms off the main thread, and <audio> playback
// runs in the browser's media pipeline. Each distinct sound is rendered once
// and cached as a small WAV.

const RATE = 22050;
const MASTER = 0.22;

let muted = (() => {
  try {
    return localStorage.getItem('egg-muted') === '1';
  } catch {
    return false;
  }
})();

const rendered = new Map<string, Promise<string | null>>();
const pools = new Map<string, HTMLAudioElement[]>();
const supported = typeof OfflineAudioContext !== 'undefined';

export const isMuted = () => muted;

export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem('egg-muted', value ? '1' : '0');
  } catch {}
  if (value) for (const pool of pools.values()) for (const a of pool) a.pause();
}

function wav(buf: AudioBuffer): string {
  const d = buf.getChannelData(0);
  const n = d.length;
  const ab = new ArrayBuffer(44 + n * 2);
  const v = new DataView(ab);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i])) * 32767, true);
  // A data URL, not a blob URL: registering a blob is a synchronous round
  // trip to the browser process, which can stall behind the audio device
  // opening on the first play.
  const bytes = new Uint8Array(ab);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:audio/wav;base64,${btoa(bin)}`;
}

function render(key: string, dur: number, build: (ac: OfflineAudioContext, out: GainNode) => void): Promise<string | null> {
  let p = rendered.get(key);
  if (!p) {
    const ac = new OfflineAudioContext(1, Math.max(1, Math.ceil((dur + 0.03) * RATE)), RATE);
    const out = ac.createGain();
    out.gain.value = MASTER;
    out.connect(ac.destination);
    build(ac, out);
    p = ac.startRendering().then(wav, () => null);
    rendered.set(key, p);
  }
  return p;
}

function play(url: string) {
  let pool = pools.get(url);
  if (!pool) pools.set(url, (pool = []));
  let a = pool.find((x) => x.paused || x.ended);
  if (!a) {
    if (pool.length < 6) pool.push((a = new Audio(url)));
    else a = pool[0];
  }
  a.currentTime = 0;
  a.play().catch(() => {});
}

function fire(key: string, dur: number, delay: number, build: (ac: OfflineAudioContext, out: GainNode) => void) {
  if (muted || !supported) return;
  const at = performance.now() + delay * 1000;
  render(key, dur, build).then((url) => {
    if (!url || muted) return;
    const wait = at - performance.now();
    if (wait > 4) setTimeout(() => !muted && play(url), wait);
    else play(url);
  });
}

// Quantised so random pitches share a handful of renders.
const q = (f: number) => Math.round(f / 20) * 20;
const NYQUIST = RATE / 2 - 100;

/** Filtered noise burst — cracks, hits, explosions. */
export function burst(dur: number, freq: number, gain = 0.6, type: BiquadFilterType = 'highpass') {
  const f = Math.min(q(freq), NYQUIST);
  fire(`b|${dur}|${f}|${gain}|${type}`, dur, 0, (ac, out) => {
    const buf = ac.createBuffer(1, Math.ceil(dur * RATE) + 1, RATE);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const filter = ac.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = f;
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, 0);
    g.gain.exponentialRampToValueAtTime(0.001, dur);
    src.connect(filter).connect(g).connect(out);
    src.start(0);
  });
}

/** Pitched blip with an optional slide — jumps, shots, pickups. */
export function tone(from: number, to: number, dur: number, gain = 0.25, type: OscillatorType = 'square', delay = 0) {
  const a = Math.min(Math.max(20, q(from)), NYQUIST);
  const b = Math.min(Math.max(20, q(to)), NYQUIST);
  fire(`t|${a}|${b}|${dur}|${gain}|${type}`, dur, delay, (ac, out) => {
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(a, 0);
    osc.frequency.exponentialRampToValueAtTime(b, dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, 0);
    g.gain.exponentialRampToValueAtTime(0.001, dur);
    osc.connect(g).connect(out);
    osc.start(0);
    osc.stop(dur + 0.02);
  });
}
