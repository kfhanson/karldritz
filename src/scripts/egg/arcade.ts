// The arcade behind the glass: menu, HUD and controls around the game canvas.
// Mounted on <html> (like the glass) so a body swap can't take it down; its
// styles travel inside it for the same reason.
import css from './arcade.css?inline';
import { isMuted, setMuted } from './audio';
import { Game, VIEW_H, VIEW_W, type Action, type Hud, type Offer } from './game';
import { WEAPONS } from './upgrades';
import { HUD_COIN, pixelLine } from './sprites';
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
        <div><dt>Round</dt><dd data-round>--</dd></div>
        <div><dt>Score</dt><dd data-score>00000</dd></div>
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
      <div class="ea-frame" tabindex="-1">
        <canvas class="ea-canvas" aria-label="Bug Hunt game"></canvas>
        <div class="ea-banner" data-banner aria-live="polite"><p data-banner-title></p><span data-banner-sub></span></div>

        <section class="ea-screen" data-screen="menu">
          <p class="ea-eyebrow">You broke the portfolio</p>
          <h3>Hold the floor.</h3>
          <p class="ea-copy">Bugs pour in through the lifts and side doors, round after round. Keep moving, aim with the mouse, dash through trouble. Every fifth round, something bigger arrives.</p>
          <div class="ea-menu">
            <button type="button" data-start>Start game <span>Enter</span></button>
            <button type="button" data-help>How to play</button>
            <button type="button" data-exit>Back to portfolio <span>Esc</span></button>
          </div>
        </section>

        <section class="ea-screen" data-screen="help" hidden>
          <p class="ea-eyebrow">How to play</p>
          <h3>Survive the rounds.</h3>
          <ul class="ea-keys">
            <li><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span> move</li>
            <li><span>Mouse</span> aim, click to shoot</li>
            <li><span><kbd>Space</kbd></span> dash, untouchable for a moment</li>
            <li><span>Pickups</span> hearts heal, bolts fire faster</li>
            <li><span>Combos</span> quick kills multiply score, up to ×5</li>
          </ul>
          <div class="ea-menu">
            <button type="button" data-back>Back <span>Esc</span></button>
          </div>
        </section>

        <section class="ea-screen ea-offer" data-screen="offer" hidden>
          <p class="ea-eyebrow" data-offer-kicker></p>
          <h3 data-offer-title></h3>
          <p class="ea-copy" data-offer-copy></p>
          <div class="ea-cards" data-offer-cards></div>
          <div class="ea-menu ea-menu-row" data-offer-actions></div>
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

        <section class="ea-screen" data-screen="over" hidden>
          <p class="ea-eyebrow" data-over-kicker>Game over</p>
          <h3 data-over-title></h3>
          <p class="ea-copy" data-over-copy></p>
          <div class="ea-menu">
            <button type="button" data-start>Play again <span>Enter</span></button>
            <button type="button" data-menu>Menu</button>
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

  let bannerTimer: ReturnType<typeof setTimeout> | undefined;
  const game = new Game(canvas, {
    hud: (h: Hud) => renderHud(h),
    banner: (title, sub) => {
      $('[data-banner-title]').textContent = title;
      $('[data-banner-sub]').textContent = sub ?? '';
      banner.classList.remove('is-on');
      void banner.offsetWidth;
      banner.classList.add('is-on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.remove('is-on'), 1700);
    },
    offer: (o: Offer) => openOffer(o),
    over: ({ score, round, best, record }) => {
      $('[data-over-kicker]').textContent = record ? 'New best' : 'Game over';
      $('[data-over-title]').textContent = `Fell on round ${round}.`;
      $('[data-over-copy]').textContent = `Score ${score.toLocaleString()} · best ${best.toLocaleString()}`;
      setTimeout(() => game.mode === 'over' && show('over'), 200);
    },
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
    pixel('[data-score]', pad(h.score, 5), String(h.score));
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

  // ── Lift offers: shop, power-up, weapon, repair ──
  const esc = (t: string) => t.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
  let offerKeys: (() => void)[] = [];
  function openOffer(o: Offer) {
    const kicker = $('[data-offer-kicker]');
    const title = $('[data-offer-title]');
    const copy = $('[data-offer-copy]');
    const cards = $('[data-offer-cards]');
    const actions = $('[data-offer-actions]');
    const card = (name: string, blurb: string, tag: string, i: number) =>
      `<button type="button" class="ea-card" data-card="${i}"><span class="ea-card-key">${i + 1}</span><strong>${esc(name)}</strong><span>${esc(blurb)}</span><em>${esc(tag)}</em></button>`;
    const done = () => {
      offerKeys = [];
      show(null);
      game.finishOffer();
    };
    offerKeys = [];
    actions.innerHTML = '';
    if (o.kind === 'perk' && o.perks) {
      kicker.textContent = 'Power-up';
      title.textContent = 'Pick one.';
      copy.textContent = 'It lasts for the rest of the run.';
      cards.innerHTML = o.perks.map((p, i) => card(p.name, p.blurb, 'Free', i)).join('');
      offerKeys = o.perks.map((p) => () => (game.takePerk(p), done()));
    } else if (o.kind === 'weapon' && o.weapons) {
      kicker.textContent = 'Weapon';
      title.textContent = 'Swap your gun.';
      copy.textContent = `Now holding: ${WEAPONS[game.weaponId].name}. Take one, or keep it.`;
      cards.innerHTML = o.weapons.map((w, i) => card(w.name, w.blurb, w.pellets > 1 ? `${w.pellets} shots` : `${w.dmg} dmg`, i)).join('');
      offerKeys = o.weapons.map((w) => () => (game.takeWeapon(w.id), done()));
      actions.innerHTML = '<button type="button" data-offer-leave>Keep my gun <span>Esc</span></button>';
    } else if (o.kind === 'shop' && o.shop) {
      kicker.textContent = 'Shop';
      title.textContent = 'Spend your chips.';
      const items = o.shop;
      const sold = new Set<number>();
      const paint = () => {
        copy.textContent = `You have ${game.funds} chips.`;
        cards.innerHTML = items
          .map((it, i) => card(it.name, it.blurb, sold.has(i) ? 'Sold' : `${it.price} chips`, i))
          .join('');
        cards.querySelectorAll<HTMLButtonElement>('[data-card]').forEach((b, i) => {
          b.disabled = sold.has(i) || game.funds < items[i].price;
        });
      };
      offerKeys = items.map((it, i) => () => {
        if (sold.has(i) || !game.buy(it)) return;
        sold.add(i);
        paint();
      });
      paint();
      actions.innerHTML = '<button type="button" data-offer-leave>Leave the shop <span>Esc</span></button>';
    } else {
      kicker.textContent = 'Repair bay';
      title.textContent = 'Good as new.';
      game.repair();
      copy.textContent = 'Fully repaired, and 10 chips found down the back of the lift.';
      cards.innerHTML = '';
      actions.innerHTML = '<button type="button" data-offer-leave>Back to the floor <span>Enter</span></button>';
    }
    cards.onclick = (e) => {
      const b = (e.target as Element).closest<HTMLButtonElement>('[data-card]');
      if (b && !b.disabled) offerKeys[Number(b.dataset.card)]?.();
    };
    actions.onclick = (e) => (e.target as Element).closest('[data-offer-leave]') && done();
    leaveOffer = done;
    show('offer');
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
    shards?.focus(b?.hasAttribute('data-start') ? 'start' : b?.hasAttribute('data-help') ? 'help' : b?.hasAttribute('data-exit') ? 'exit' : null);
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
    show(null);
    root.classList.add('is-playing');
    game.start();
  };
  const toMenu = () => {
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
      if (e.code === 'Escape') return void e.preventDefault(); // a power-up must be picked
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
    frame.style.setProperty('--fit-w', `${snapped >= avail * 0.92 ? snapped : avail}px`);
  });
  ro.observe(sizer);

  // The shards must be in place on the very frame the page breaks, so the
  // menu opens now; the rest of the arcade rises in on the next frame.
  openMenu();
  requestAnimationFrame(() => root.classList.add('is-in'));

  return {
    exit,
    reassemble: () => shards?.home() ?? Promise.resolve(),
    destroy: (fadeOut) =>
      new Promise<void>((resolve) => {
        const done = () => {
          shards?.destroy();
          game.destroy();
          ro.disconnect();
          clearTimeout(bannerTimer);
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
