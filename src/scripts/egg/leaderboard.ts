// The leaderboard: finished runs, best first. For now it lives in this
// browser's storage; it's async so a shared board on a server can take its
// place without the arcade changing.

export interface Run {
  name: string;
  score: number;
  time: number; // seconds of play
  round: number;
  won: boolean; // beat the Daemon on round 20
}

export interface Entry extends Run {
  at: number; // when it was set, ms since the epoch
}

const KEY = 'egg-board';
const NAME_KEY = 'egg-name';
const KEEP = 50;
export const NAME_MAX = 12;

// Higher score first; on a tie the quicker run, then the earlier one.
const order = (a: Entry, b: Entry) => b.score - a.score || a.time - b.time || a.at - b.at;

const isEntry = (e: unknown): e is Entry => {
  const x = e as Entry;
  return !!x && typeof x.name === 'string' && Number.isFinite(x.score) && Number.isFinite(x.time) &&
    Number.isFinite(x.round) && typeof x.won === 'boolean' && Number.isFinite(x.at);
};

function load(): Entry[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(list) ? list.filter(isEntry).sort(order) : [];
  } catch {
    return [];
  }
}

/** One line of plain text, at most NAME_MAX characters. */
export function cleanName(raw: string): string {
  const name = raw.replace(/[\p{C}]/gu, '').replace(/\s+/g, ' ').trim();
  return [...name].slice(0, NAME_MAX).join('') || 'Anonymous';
}

/** The name last saved from this browser, to fill in next time. */
export function lastName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export async function topRuns(n = 10): Promise<Entry[]> {
  return load().slice(0, n);
}

/** Save a run. Resolves with it as saved and its place on the board (1 = top). */
export async function saveRun(run: Run): Promise<{ entry: Entry; place: number }> {
  const entry: Entry = { ...run, name: cleanName(run.name), at: Date.now() };
  const list = load();
  list.push(entry);
  list.sort(order);
  const place = list.indexOf(entry) + 1;
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, KEEP)));
    localStorage.setItem(NAME_KEY, entry.name);
  } catch {}
  return { entry, place };
}

/** m:ss, or h:mm:ss for a long run; with hundredths when `fine`. */
export function clock(seconds: number, fine = false): string {
  const cs = Math.floor(seconds * 100);
  const s = Math.floor(cs / 100);
  const h = Math.floor(s / 3600);
  const m = Math.floor(s / 60) % 60;
  const ss = String(s % 60).padStart(2, '0');
  const head = h ? `${h}:${String(m).padStart(2, '0')}` : String(m);
  return `${head}:${ss}${fine ? '.' + String(cs % 100).padStart(2, '0') : ''}`;
}
