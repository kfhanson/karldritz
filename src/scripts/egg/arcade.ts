// The arcade behind the glass: menu, HUD and controls around the game canvas.
// Mounted on <html> (like the glass) so a body swap can't take it down; its
// styles travel inside it for the same reason.
import css from './arcade.css?inline';
import { isMuted, setMuted } from './audio';
import { Game, VIEW_H, VIEW_W, type Action, type Hud, type Offer, type RunResult } from './game';
import { clock, lastName, NAME_MAX, saveRun, topRuns, type Entry } from './leaderboard';
import { WEAPONS } from './upgrades';
import { HUD_COIN, pixelLine, wareIcon } from './sprites';
import { gunIcon } from './people';
import { createShardMenu, type ShardMenu, type ShardSource } from './shardmenu';

const KEYS: Record<string, Action> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  Space: 'jump',
  KeyZ: 'jump',
  ArrowDown: 'down',
  KeyS: 'down',
  KeyX: 'fire',
  KeyJ: 'fire',
  KeyK: 'fire',
};

const HEART_SVG = (() => {
  const rows = ['.rr.rr.', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'];
  const rects = rows
    .flatMap((row, y) => [...row].map((ch, x) => (ch === 'r' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : '')))
    .join('');
  return `<svg viewBox="0 0 7 6" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
})();

const pad = (n: number, w: number) => String(n).padStart(w, '0');

const TEMPLATE = `
  <style>${css}</style>
  <div class="ea-shell">
    <header class="ea-top">
      <p class="ea-kicker"><span class="ea-dot"></span>Hidden level</p>
      <dl class="ea-hud" aria-live="off">
        <div class="ea-floor"><dt>Floor</dt><dd data-floor>--</dd></div>
        <div><dt>Round</dt><dd data-round>--</dd></div>
        <div><dt>Score</dt><dd data-score>00000</dd></div>
        <div class="ea-time"><dt>Time</dt><dd data-time>0:00</dd></div>
        <div class="ea-best"><dt>Best</dt><dd data-best>00000</dd></div>
        <div class="ea-chips"><dt>Chips</dt><dd data-chips>000</dd></div>
        <div class="ea-weapon"><dt>Gun</dt><dd data-weapon>Pistol</dd></div>
        <div class="ea-hearts" data-hearts aria-label="Health"></div>
        <div class="ea-mult" data-mult hidden></div>
      </dl>
      <div class="ea-actions">
        <button type="button" class="ea-chip" data-mute></button>
        <button type="button" class="ea-chip" data-exit>Back to portfolio <kbd>Esc</kbd></button>
      </div>
    </header>

    <div class="ea-stage">
      <div class="ea-sizer" aria-hidden="true"></div>
      <div class="ea-meta" aria-hidden="true"><span class="ea-fps" data-fps>-- FPS</span></div>
      <div class="ea-frame" tabindex="-1">
        <canvas class="ea-canvas" aria-label="Bug Hunt game"></canvas>
        <div class="ea-banner" data-banner aria-live="polite"><p data-banner-title></p><span data-banner-sub></span></div>

        <section class="ea-screen" data-screen="menu">
          <p class="ea-eyebrow">You broke the portfolio</p>
          <h3>Hold the floor.</h3>
          <p class="ea-copy">Fight your way down from 10F, a floor a round, as bugs pour in through the lifts and side doors. Keep moving, aim with the mouse, dash through trouble. Every fifth round, something bigger arrives. Clear round 20 to win.</p>
          <div class="ea-menu">
            <button type="button" data-start>Start game <span>Enter</span></button>
            <button type="button" data-help>How to play</button>
            <button type="button" data-exit>Back to portfolio <span>Esc</span></button>
          </div>
        </section>

        <section class="ea-screen" data-screen="help" hidden>
          <p class="ea-eyebrow">How to play</p>
          <h3>Survive 20 rounds.</h3>
          <ul class="ea-keys">
            <li><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span> move</li>
            <li><span>Mouse</span> aim, click to shoot</li>
            <li><span><kbd>Space</kbd></span> dash, untouchable for a moment</li>
            <li><span>Pickups</span> hearts heal, bolts fire faster</li>
            <li><span>Chips</span> spend them at the shop and vending machine between rounds</li>
            <li><span>Combos</span> quick kills multiply score, up to ×5</li>
            <li><span>Round 20</span> beat the boss to win, then sign the leaderboard</li>
          </ul>
          <div class="ea-menu">
            <button type="button" data-back>Back <span>Esc</span></button>
          </div>
        </section>

        <section class="ea-screen ea-offer" data-screen="offer" hidden>
          <div class="ea-offer-body" data-offer-body></div>
        </section>

        <section class="ea-screen" data-screen="paused" hidden>
          <p class="ea-eyebrow">Paused</p>
          <h3>Take a breath.</h3>
          <div class="ea-menu">
            <button type="button" data-resume>Resume <span>Esc</span></button>
            <button type="button" data-start>Restart</button>
            <button type="button" data-menu>Quit to menu</button>
          </div>
        </section>

        <section class="ea-screen ea-over" data-screen="over" hidden>
          <div class="ea-over-main">
            <p class="ea-eyebrow" data-over-kicker>Game over</p>
            <h3 data-over-title></h3>
            <p class="ea-copy" data-over-copy></p>
            <form class="ea-name" data-name-form>
              <label class="ea-sr" for="ea-name">Your name for the leaderboard</label>
              <input id="ea-name" data-name maxlength="${NAME_MAX}" placeholder="Your name" autocomplete="nickname" spellcheck="false" enterkeyhint="done" />
              <button type="submit">Save <span>Enter</span></button>
            </form>
            <div class="ea-menu">
              <button type="button" data-start>Play again</button>
              <button type="button" data-menu>Menu</button>
            </div>
          </div>
          <div class="ea-over-board">
            <p class="ea-eyebrow">Leaderboard</p>
            <ol class="ea-board" data-board></ol>
          </div>
        </section>
      </div>

      <p class="ea-help">
        <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move</span>
        <span>Mouse aim</span>
        <span>Click shoot</span>
        <span><kbd>Space</kbd> dash</span>
        <span><kbd>P</kbd> pause</span>
      </p>

      <p class="ea-rotate">Turn your phone sideways for a bigger room</p>

      <div class="ea-touch" aria-hidden="true">
        <div>
          <button type="button" data-hold="left">◀</button>
          <button type="button" data-hold="right">▶</button>
          <button type="button" data-hold="up">▲</button>
          <button type="button" data-hold="down">▼</button>
        </div>
        <div>
          <button type="button" data-hold="fire">Fire</button>
          <button type="button" data-hold="jump">Dash</button>
        </div>
      </div>
    </div>
  </div>
`;

const TYPE_CSS = 'https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400..700&family=Silkscreen&display=swap';

/** Fetch the pixel faces ahead of time: the menu's glass labels are drawn on
 * the frame the page breaks, too soon to wait for them. */
export { warmKit } from './game';

export function preloadType() {
  if (document.querySelector('link[data-egg-type]')) return;
  const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: TYPE_CSS });
  link.dataset.eggType = '';
  document.documentElement.appendChild(link); // outside <head>, which page swaps replace
  link.onload = () => {
    document.fonts.load('600 20px "Pixelify Sans"').catch(() => {});
    document.fonts.load('9px Silkscreen').catch(() => {});
  };
}

export interface Arcade {
  /** Resolves when the player asks to leave. */
  exit: Promise<void>;
  /** Send the menu's shards back to their places in the page. */
  reassemble(): Promise<void>;
  destroy(fade: boolean): Promise<void>;
}

export function openArcade({ fade, shardSource }: { fade: boolean; shardSource?: ShardSource }): Arcade {
  const root = document.createElement('div');
  root.className = 'egg-arcade';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Bug Hunt, a hidden game');
  preloadType();
  root.innerHTML = TEMPLATE;
  root.dataset.type = 'pixel';
  if (fade) root.classList.add('is-fading');
  document.documentElement.appendChild(root);

  const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T & HTMLElement>(sel)!;
  const $$ = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));
  const frame = $('.ea-frame');
  const canvas = $<HTMLCanvasElement>('.ea-canvas');
  const screens = $$('[data-screen]');
  const banner = $('[data-banner]');
  const muteBtn = $('[data-mute]');

  // The page underneath stays put but can't be reached while the arcade is up.
  const body = document.body;
  const wasInert = body.inert;
  body.inert = true;
  const scrollLock = document.createElement('style');
  scrollLock.textContent = 'html,body{overflow:hidden!important}';
  root.appendChild(scrollLock);

  let resolveExit!: () => void;
  const exit = new Promise<void>((r) => (resolveExit = r));
  let leaving = false;

  const show = (name: string | null) => {
    screens.forEach((s) => (s.hidden = s.dataset.screen !== name));
    const active = screens.find((s) => !s.hidden);
    active?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
    if (!active) frame.focus({ preventScroll: true });
  };

  // The banner runs on the Web Animations API, not a CSS class: restarting a
  // CSS animation takes a forced layout, and "Round 1" lands just as the
  // menu closes, when that layout costs the most.
  let bannerAnim: Animation | null = null;
  const BANNER_IN: Keyframe[] = [
    { opacity: 0, transform: 'translateY(10px)' },
    { opacity: 1, transform: 'none', offset: 0.15 },
    { opacity: 1, transform: 'none', offset: 0.75 },
    { opacity: 0, transform: 'translateY(-6px)' },
  ];
  // Reduced motion: it simply shows, then goes.
  const BANNER_STILL: Keyframe[] = [{ opacity: 1 }, { opacity: 1, offset: 0.99 }, { opacity: 0 }];
  const game = new Game(canvas, {
    hud: (h: Hud) => renderHud(h),
    banner: (title, sub, dark) => {
      $('[data-banner-title]').textContent = title;
      banner.classList.toggle('is-dark', !!dark);
      $('[data-banner-sub]').textContent = sub ?? '';
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      bannerAnim?.cancel();
      bannerAnim = banner.animate(still ? BANNER_STILL : BANNER_IN, {
        duration: 1700,
        easing: still ? 'linear' : 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'both',
      });
    },
    offer: (o: Offer) => openOffer(o),
    over: (r) => gameOver(r),
  });

  // Dev only (stripped from builds): lets test scripts drive the game.
  if (import.meta.env.DEV) (window as unknown as { __eggGame?: Game }).__eggGame = game;

  const hearts = $('[data-hearts]');
  let heartCount = -1;
  // HUD values are pixel art: a canvas drawn at 1px per pixel and scaled up
  // crisp by CSS, with the plain value kept for screen readers.
  const coin = HUD_COIN();
  const shown = new Map<string, string>();
  // One canvas per value, redrawn in place: late rounds change the score and
  // chips many times a second.
  const arts = new Map<string, { art: HTMLCanvasElement; sr: HTMLSpanElement }>();
  const pixel = (sel: string, text: string, label: string, icon?: HTMLCanvasElement, key = text, color?: string) => {
    if (shown.get(sel) === key) return;
    shown.set(sel, key);
    let slot = arts.get(sel);
    if (!slot) {
      const art = document.createElement('canvas');
      art.className = 'ea-px';
      art.setAttribute('aria-hidden', 'true');
      const sr = Object.assign(document.createElement('span'), { className: 'ea-sr' });
      $(sel).replaceChildren(art, sr);
      arts.set(sel, (slot = { art, sr }));
    }
    pixelLine(text, icon, color, slot.art);
    slot.art.style.setProperty('--w', String(slot.art.width));
    slot.art.style.setProperty('--h', String(slot.art.height));
    slot.sr.textContent = label;
  };
  function renderHud(h: Hud) {
    const idle = game.mode === 'attract';
    const round = idle ? '--' : pad(h.round, 2);
    pixel('[data-round]', round, round);
    const floor = idle ? '--' : h.floor;
    pixel('[data-floor]', floor, floor);
    pixel('[data-score]', pad(h.score, 5), String(h.score));
    const t = clock(h.time);
    pixel('[data-time]', t, t);
    pixel('[data-best]', pad(h.best, 5), String(h.best));
    pixel('[data-chips]', pad(h.chips, 3), `${h.chips} chips`, coin);
    pixel('[data-weapon]', '', h.weapon, gunIcon(h.weaponId), h.weaponId);
    if (heartCount !== h.maxHp) {
      hearts.innerHTML = Array.from({ length: h.maxHp }, () => `<span class="ea-heart">${HEART_SVG}</span>`).join('');
      heartCount = h.maxHp;
    }
    const hp = idle ? h.maxHp : h.hp;
    Array.from(hearts.children).forEach((el, i) => el.classList.toggle('is-empty', i >= hp));
    hearts.setAttribute('aria-label', `Health ${hp} of ${h.maxHp}`);
    const mult = $('[data-mult]');
    mult.hidden = h.mult < 2;
    if (h.mult >= 2) pixel('[data-mult]', `x${h.mult}`, `times ${h.mult}`, undefined, `x${h.mult}`, '#F6F5F1');
    root.classList.toggle('is-rapid', h.rapid);
  }

  // ── The end of a run, and the leaderboard ──
  // The board shows only here, once a run is over: never over the game.
  // Every finished run goes on it. The name field is filled in with
  // the last name used; the run is saved when it's submitted, or with
  // whatever is in the field when the player moves on.
  const nameForm = $<HTMLFormElement>('[data-name-form]');
  const nameInput = $<HTMLInputElement>('[data-name]');
  let pending: RunResult | null = null;
  let saving: Promise<void> | null = null;

  const row = (e: Entry, place: number, you: boolean) =>
    `<li class="${you ? 'is-you' : ''}"><span>${place}</span><b>${esc(e.name)}</b>` +
    `<em>${e.won ? 'Won' : `R${e.round}`}</em><span>${clock(e.time)}</span><span>${e.score.toLocaleString()}</span></li>`;
  const empty = '<li class="ea-board-empty">No runs yet. Be the first.</li>';

  // The top of the board, and the player's own run below it if it didn't make the cut.
  async function paintBoard(list: HTMLElement, n: number, mine?: { entry: Entry; place: number }) {
    const top = await topRuns(n);
    const you = (e: Entry) => !!mine && e.at === mine.entry.at && e.score === mine.entry.score;
    let html = top.map((e, i) => row(e, i + 1, you(e))).join('');
    if (mine && mine.place > n) html += '<li class="ea-board-gap" aria-hidden="true">···</li>' + row(mine.entry, mine.place, true);
    list.innerHTML = html || empty;
  }

  function gameOver(r: RunResult) {
    pending = r.score > 0 ? r : null;
    $('[data-over-kicker]').textContent = r.won ? 'You won' : r.record ? 'New best' : 'Game over';
    $('[data-over-title]').textContent = r.won ? 'You got out.' : `Fell on ${r.floor === 'G' ? 'the ground floor' : r.floor}, round ${r.round}.`;
    $('[data-over-copy]').textContent = `Score ${r.score.toLocaleString()} in ${clock(r.time, true)} · best ${r.best.toLocaleString()}`;
    nameForm.hidden = !pending;
    nameInput.value = lastName();
    paintBoard($('[data-board]'), 5);
    setTimeout(() => {
      if (game.mode !== 'over') return;
      show('over');
      // With a keyboard to hand, straight into the name; Enter saves it.
      // (On a touchscreen that would throw a keyboard over the result.)
      if (pending && window.matchMedia('(pointer: fine)').matches) {
        nameInput.focus({ preventScroll: true });
        nameInput.select();
      } else if (!pending) $('[data-screen="over"] [data-start]').focus({ preventScroll: true });
    }, 200);
  }

  function commit(): Promise<void> {
    if (!pending) return saving ?? Promise.resolve();
    const r = pending;
    pending = null;
    nameForm.hidden = true;
    saving = saveRun({ name: nameInput.value, score: r.score, time: r.time, round: r.round, won: r.won })
      .then((mine) => paintBoard($('[data-board]'), 5, mine))
      .catch(() => {});
    return saving;
  }

  nameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    commit();
    $('[data-screen="over"] [data-start]').focus({ preventScroll: true });
  });
  // Keys still held from the run (WASD, say) repeat into the field as it
  // takes focus: only fresh presses type.
  nameInput.addEventListener('keydown', (e) => e.repeat && e.key.length === 1 && e.preventDefault());

  // ── Between rounds: the shop site, the vending machine, the weapon crate ──
  const esc = (t: string) => t.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
  // Pixel art in the markup: a placeholder now, a copy of the canvas once the
  // markup's in (fillPics), scaled a whole multiple by CSS so it stays crisp.
  // Not toDataURL: reading a canvas back waits on the GPU, which cost a
  // sixth of a second when the arcade first opened, mid-shatter.
  let picQueue: HTMLCanvasElement[] = [];
  const pic = (c: HTMLCanvasElement, k: number) =>
    `<canvas class="ea-pic" data-pic="${picQueue.push(c) - 1}" width="${c.width}" height="${c.height}" style="--w:${c.width * k}px;--h:${c.height * k}px" aria-hidden="true"></canvas>`;
  const fillPics = (root: ParentNode) => {
    root.querySelectorAll<HTMLCanvasElement>('canvas[data-pic]').forEach((el) => {
      const src = picQueue[Number(el.dataset.pic)];
      if (src) el.getContext('2d')!.drawImage(src, 0, 0);
      el.removeAttribute('data-pic');
    });
    picQueue = [];
  };
  // A made-up but steady rating for each thing in the shop.
  const rating = (id: string) => {
    let h = 7;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return { stars: 4 + (h % 3 === 0 ? 1 : 0), reviews: 40 + (h % 960) };
  };
  let offerKeys: (() => void)[] = [];
  function openOffer(o: Offer) {
    const body = $('[data-offer-body]');
    const screen = $('[data-screen="offer"]');
    screen.dataset.kind = o.kind;
    const done = () => {
      offerKeys = [];
      show(null);
      game.finishOffer();
    };
    offerKeys = [];
    if (o.kind === 'crate' && o.weapons) {
      const guns = o.weapons;
      body.innerHTML =
        `<p class="ea-eyebrow">Weapon crate</p><h3>Pick a gun.</h3>` +
        `<p class="ea-copy">Now holding: ${esc(WEAPONS[game.weaponId].name)}. Take one, or keep it.</p>` +
        `<div class="ea-cards" data-cards>${guns
          .map((w, i) => `<button type="button" class="ea-card ea-gun" data-card="${i}"><span class="ea-card-key">${i + 1}</span>${pic(gunIcon(w.id), 3)}<strong>${esc(w.name)}</strong><span>${esc(w.blurb)}</span><em>${w.pellets > 1 ? `${w.pellets} shots` : `${w.dmg} dmg`}</em></button>`)
          .join('')}</div>` +
        `<div class="ea-menu ea-menu-row"><button type="button" data-offer-leave>Keep my gun <span>Esc</span></button></div>`;
      offerKeys = guns.map((w) => () => (game.takeWeapon(w.id), done()));
    } else if (o.wares) {
      const wares = o.wares;
      const sold = o.sold;
      if (o.kind === 'shop') {
        // A shopping site, open on the computer.
        body.innerHTML =
          `<div class="ea-site" role="group" aria-label="BugMart, the shop">` +
          `<div class="ea-site-bar"><span class="ea-site-dots" aria-hidden="true"><i></i><i></i><i></i></span>` +
          `<span class="ea-site-url">bugmart.shop/deals</span>` +
          `<button type="button" class="ea-site-close" data-offer-leave>Close tab <kbd>Esc</kbd></button></div>` +
          `<div class="ea-site-head"><strong class="ea-site-logo">Bug<span>Mart</span></strong>` +
          `<span class="ea-site-search" aria-hidden="true">Search for gear…</span>` +
          `<span class="ea-site-wallet">${pic(coin, 2)}<b data-wallet></b> chips</span></div>` +
          `<p class="ea-site-deal">Delivered before the next round · Prices rise with every order</p>` +
          `<div class="ea-site-grid" data-cards>${wares
            .map((w, i) => {
              const r = rating(w.id);
              return `<button type="button" class="ea-ware" data-card="${i}"><span class="ea-card-key">${i + 1}</span>` +
                `<span class="ea-ware-pic">${pic(wareIcon(w.icon), 4)}</span><strong>${esc(w.name)}</strong>` +
                `<span class="ea-ware-blurb">${esc(w.blurb)}</span>` +
                `<span class="ea-ware-stars" aria-label="${r.stars} stars">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)} <small>(${r.reviews})</small></span>` +
                `<span class="ea-ware-buy"><b data-price></b><em data-tag></em></span></button>`;
            })
            .join('')}</div></div>`;
      } else {
        // A vending machine: a glass front of slots, a credit display, a tray.
        body.innerHTML =
          `<div class="ea-vend" role="group" aria-label="Vending machine">` +
          `<div class="ea-vend-glass" data-cards>${wares
            .map((w, i) => `<button type="button" class="ea-slot" data-card="${i}">${pic(wareIcon(w.icon), 3)}` +
              `<strong>${esc(w.name)}</strong><span>${esc(w.blurb)}</span>` +
              `<em><b>${'AB'[Math.floor(i / 3)]}${(i % 3) + 1}</b> <i data-tag></i></em></button>`)
            .join('')}</div>` +
          `<div class="ea-vend-side"><p class="ea-vend-name">Snack &amp; Upgrade</p>` +
          `<div class="ea-vend-lcd"><span>Credit</span><b data-wallet></b></div>` +
          `<p class="ea-vend-hint">Keys 1–${wares.length} · Each buy costs more</p>` +
          `<div class="ea-vend-tray" data-tray aria-live="polite"></div>` +
          `<button type="button" class="ea-vend-leave" data-offer-leave>Walk away <span>Esc</span></button></div></div>`;
      }
      const tray = body.querySelector<HTMLElement>('[data-tray]');
      const paint = () => {
        body.querySelector('[data-wallet]')!.textContent = String(game.funds);
        body.querySelectorAll<HTMLButtonElement>('[data-card]').forEach((b, i) => {
          // Prices climb with every purchase, so they're redrawn after each.
          const price = game.price(wares[i]);
          b.disabled = sold.has(i) || game.funds < price;
          const shown = b.querySelector('[data-price]');
          if (shown) shown.textContent = `${price} chips`;
          b.classList.toggle('is-sold', sold.has(i));
          const tag = b.querySelector('[data-tag]')!;
          if (o.kind === 'shop') tag.textContent = sold.has(i) ? 'Bought' : game.funds < price ? 'Not enough' : 'Buy now';
          else tag.textContent = sold.has(i) ? 'Sold' : String(price);
        });
      };
      offerKeys = wares.map((w, i) => () => {
        if (sold.has(i) || !game.buy(w)) return;
        sold.add(i);
        if (tray) (tray.innerHTML = `${pic(wareIcon(w.icon), 3)}<span>${esc(w.name)}</span>`), fillPics(tray);
        paint();
      });
      paint();
    }
    fillPics(body);
    body.onclick = (e) => {
      const t = e.target as Element;
      const b = t.closest<HTMLButtonElement>('[data-card]');
      if (b && !b.disabled) offerKeys[Number(b.dataset.card)]?.();
      else if (t.closest('[data-offer-leave]')) done();
    };
    leaveOffer = done;
    show('offer');
    (body.querySelector<HTMLElement>('[data-card]:not(:disabled)') ?? body.querySelector<HTMLElement>('[data-offer-leave]'))?.focus({ preventScroll: true });
  }
  let leaveOffer: (() => void) | null = null;

  // ── The start menu: glass shards when the browser can draw them ──
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let shards: ShardMenu | null = null;
  if (!fade && !reduce) {
    shards = createShardMenu(
      root,
      [
        { id: 'start', label: 'Start game', hint: 'Enter' },
        { id: 'help', label: 'How to play' },
        { id: 'exit', label: 'Back to portfolio', hint: 'Esc' },
      ],
      () => frame.getBoundingClientRect(),
      { canvas, rect: () => canvas.getBoundingClientRect() },
      (id) => choose(id),
      shardSource,
    );
  }
  // The real buttons stay underneath, invisible, for the keyboard and screen
  // readers; focusing one lights up its shard.
  root.classList.toggle('has-shards', !!shards);
  const menuScreen = $('[data-screen="menu"]');
  menuScreen.addEventListener('focusin', (e) => {
    const b = (e.target as Element).closest('button');
    const id = b && ['start', 'help', 'exit'].find((k) => b.hasAttribute(`data-${k}`));
    shards?.focus(id ?? null);
  });
  menuScreen.addEventListener('focusout', () => shards?.focus(null));

  const openMenu = () => {
    show('menu');
    shards?.show();
  };

  let choosing = false;
  async function choose(id: string) {
    if (choosing || leaving) return;
    choosing = true;
    try {
      if (id === 'help') {
        if (shards?.visible) await shards.hide();
        show('help');
      } else if (id === 'start') {
        if (shards?.visible) await shards.pick(id);
        start();
      } else {
        leave(); // the shards fly home as the page reassembles
      }
    } finally {
      choosing = false;
    }
  }

  const start = () => {
    commit();
    show(null);
    root.classList.add('is-playing');
    game.start();
  };
  const toMenu = () => {
    commit();
    game.attract();
    root.classList.remove('is-playing');
    openMenu();
  };
  const pause = () => {
    if (game.mode !== 'play') return;
    game.pause();
    show('paused');
  };
  const resume = () => {
    if (game.mode !== 'paused') return;
    show(null);
    game.resume();
  };
  const leave = () => {
    if (leaving) return;
    leaving = true;
    commit();
    game.pause();
    resolveExit();
  };

  const syncMute = () => {
    muteBtn.textContent = isMuted() ? 'Sound off' : 'Sound on';
    muteBtn.setAttribute('aria-pressed', String(!isMuted()));
  };
  syncMute();

  // ── Buttons ──
  root.addEventListener('click', (e) => {
    const t = (e.target as Element).closest('button');
    if (!t) return;
    if (t.hasAttribute('data-start')) game.mode === 'attract' ? choose('start') : start();
    else if (t.hasAttribute('data-help')) choose('help');
    else if (t.hasAttribute('data-back')) openMenu();
    else if (t.hasAttribute('data-resume')) resume();
    else if (t.hasAttribute('data-menu')) toMenu();
    else if (t.hasAttribute('data-exit')) choose('exit');
    else if (t.hasAttribute('data-mute')) (setMuted(!isMuted()), syncMute());
  });

  // ── Keyboard ──
  const onKey = (e: KeyboardEvent) => {
    if (leaving) return;
    // Typing a name: the keys are letters, not controls.
    if (e.target === nameInput) return;
    const down = e.type === 'keydown';
    const action = KEYS[e.code];
    if (game.mode === 'play') {
      if (action) {
        e.preventDefault();
        down ? game.press(action) : game.release(action);
        return;
      }
      if (down && (e.code === 'Escape' || e.code === 'KeyP')) return void (e.preventDefault(), pause());
    }
    if (!down) return;
    if (game.mode === 'offer') {
      const n = /^Digit([1-9])$/.exec(e.code);
      if (n) return void (e.preventDefault(), offerKeys[Number(n[1]) - 1]?.());
      const leaveBtn = root.querySelector('[data-offer-leave]');
      if ((e.code === 'Escape' || (e.code === 'Enter' && !(document.activeElement instanceof HTMLButtonElement))) && leaveBtn) {
        return void (e.preventDefault(), leaveOffer?.());
      }
    }
    if (e.code === 'KeyM') return void (setMuted(!isMuted()), syncMute());
    if (game.mode === 'paused' && (e.code === 'Escape' || e.code === 'KeyP')) return void (e.preventDefault(), resume());
    if (e.code === 'Escape') {
      e.preventDefault();
      const help = screens.find((x) => x.dataset.screen === 'help');
      return void (help && !help.hidden ? openMenu() : choose('exit'));
    }
    // Enter starts from the menu or game-over screen unless a button has focus
    // (then the button's own action runs).
    if (e.code === 'Enter' && (game.mode === 'attract' || game.mode === 'over')) {
      if (!(document.activeElement instanceof HTMLButtonElement)) {
        e.preventDefault();
        game.mode === 'attract' ? choose('start') : start();
      }
    }
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);

  // ── Mouse: aim at the cursor, hold the button to fire ──
  let mouseFiring = false;
  const toGame = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    game.setAim(((e.clientX - r.left) / r.width) * VIEW_W, ((e.clientY - r.top) / r.height) * VIEW_H);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    game.setAimMode('mouse');
    toGame(e);
  };
  frame.addEventListener('pointermove', onPointerMove);
  frame.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || e.button !== 0 || game.mode !== 'play') return;
    e.preventDefault();
    game.setAimMode('mouse');
    toGame(e);
    mouseFiring = true;
    game.press('fire');
  });
  const onPointerUp = () => {
    if (!mouseFiring) return;
    mouseFiring = false;
    game.release('fire');
  };
  window.addEventListener('pointerup', onPointerUp);
  frame.addEventListener('contextmenu', (e) => game.mode === 'play' && e.preventDefault());

  // ── Touch ──
  root.querySelectorAll<HTMLElement>('[data-hold]').forEach((btn) => {
    const a = btn.dataset.hold as Action;
    const on = (e: PointerEvent) => {
      e.preventDefault();
      game.setAimMode('auto'); // no cursor on a touchscreen: shots seek the nearest bug
      btn.setPointerCapture?.(e.pointerId);
      btn.classList.add('is-down');
      game.press(a);
    };
    const off = () => {
      btn.classList.remove('is-down');
      game.release(a);
    };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  // Losing focus mid-round pauses rather than letting the room eat you.
  const onBlur = () => pause();
  const onVis = () => document.hidden && pause();
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVis);

  // Crisp pixels: render at an integer multiple of the game resolution that's
  // closest to the frame's device-pixel width.
  // The game draws at its own 320×184; the browser enlarges it. Where it costs
  // little room, snap the frame to a whole multiple of that in device pixels
  // so every art pixel comes out the same size. (Drawing it pre-enlarged
  // instead repainted millions of pixels a frame for no visible gain.)
  game.resize(1);
  const sizer = $('.ea-sizer');
  const ro = new ResizeObserver(() => {
    const dpr = window.devicePixelRatio || 1;
    const avail = sizer.clientWidth;
    const k = Math.max(1, Math.floor((avail * dpr) / VIEW_W));
    const snapped = (k * VIEW_W) / dpr;
    // Snapping can cost up to one step of size; past 8% the room matters more
    // than perfectly even pixels (on sharp screens the unevenness is hard to see).
    // On the stage, so the frame and the row above it share the width.
    $('.ea-stage').style.setProperty('--fit-w', `${snapped >= avail * 0.92 ? snapped : avail}px`);
  });
  ro.observe(sizer);

  // The shards must be in place on the very frame the page breaks, so the
  // menu opens now; the rest of the arcade rises in on the next frame.
  openMenu();
  requestAnimationFrame(() => root.classList.add('is-in'));

  // Frame rate: frames counted over half a second, shown twice a second.
  const fpsEl = $('[data-fps]');
  let fpsRaf = 0;
  let fpsFrames = 0;
  let fpsFrom = performance.now();
  const fpsTick = (now: number) => {
    fpsFrames++;
    if (now - fpsFrom >= 500) {
      const fps = Math.round((fpsFrames * 1000) / (now - fpsFrom));
      fpsEl.textContent = `${fps} FPS`;
      fpsEl.classList.toggle('is-low', fps < 50);
      fpsFrames = 0;
      fpsFrom = now;
    }
    fpsRaf = requestAnimationFrame(fpsTick);
  };
  fpsRaf = requestAnimationFrame(fpsTick);

  return {
    exit,
    reassemble: () => shards?.home() ?? Promise.resolve(),
    destroy: (fadeOut) =>
      new Promise<void>((resolve) => {
        const done = () => {
          cancelAnimationFrame(fpsRaf);
          shards?.destroy();
          game.destroy();
          ro.disconnect();
          bannerAnim?.cancel();
          window.removeEventListener('keydown', onKey, true);
          window.removeEventListener('keyup', onKey, true);
          window.removeEventListener('blur', onBlur);
          window.removeEventListener('pointerup', onPointerUp);
          document.removeEventListener('visibilitychange', onVis);
          // The body may have been swapped by a navigation while we were up.
          document.body.inert = document.body === body ? wasInert : false;
          root.remove();
          resolve();
        };
        if (!fadeOut) return done();
        root.classList.add('is-fading');
        root.classList.remove('is-in');
        setTimeout(done, 320);
      }),
  };
}
