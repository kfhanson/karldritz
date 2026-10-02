// The arcade behind the glass: menu, HUD and controls around the game canvas.
// Mounted on <html> (like the glass) so a body swap can't take it down; its
// styles travel inside it for the same reason.
import css from './arcade.css?inline';
import { isMuted, setMuted } from './audio';
import { Game, VIEW_H, VIEW_W, type Action, type Hud } from './game';

const KEYS: Record<string, Action> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  Space: 'up',
  KeyZ: 'up',
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
      <div class="ea-actions">
        <button type="button" class="ea-chip" data-mute></button>
        <button type="button" class="ea-chip" data-exit>Back to portfolio <kbd>Esc</kbd></button>
      </div>
    </header>

    <div class="ea-stage">
      <div class="ea-bar">
        <h2 class="ea-title">Bug <em>Hunt</em></h2>
        <dl class="ea-hud" aria-live="off">
          <div><dt>Round</dt><dd data-round>--</dd></div>
          <div><dt>Score</dt><dd data-score>00000</dd></div>
          <div><dt>Best</dt><dd data-best>00000</dd></div>
          <div class="ea-hearts" data-hearts aria-label="Health"></div>
          <div class="ea-mult" data-mult hidden></div>
        </dl>
      </div>

      <div class="ea-frame" tabindex="-1">
        <canvas class="ea-canvas" aria-label="Bug Hunt game"></canvas>
        <div class="ea-banner" data-banner aria-live="polite"><p data-banner-title></p><span data-banner-sub></span></div>

        <section class="ea-screen" data-screen="menu">
          <p class="ea-eyebrow">You broke the portfolio</p>
          <h3>Clear the office.</h3>
          <p class="ea-copy">Bugs ride the elevators in, floor after floor. Take the stairs, aim with the mouse, and keep the building clean. Every fifth round, something bigger arrives.</p>
          <div class="ea-menu">
            <button type="button" data-start>Start game <span>Enter</span></button>
            <button type="button" data-exit>Back to portfolio <span>Esc</span></button>
          </div>
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
        <span><kbd>A</kbd><kbd>D</kbd> move</span>
        <span><kbd>W</kbd> / <kbd>Space</kbd> jump</span>
        <span>Mouse aim</span>
        <span>Click shoot</span>
        <span><kbd>S</kbd> + jump step off stairs</span>
        <span><kbd>P</kbd> pause</span>
      </p>

      <div class="ea-touch" aria-hidden="true">
        <div>
          <button type="button" data-hold="left">◀</button>
          <button type="button" data-hold="right">▶</button>
          <button type="button" data-hold="down">▼</button>
        </div>
        <div>
          <button type="button" data-hold="fire">Fire</button>
          <button type="button" data-hold="up">Jump</button>
        </div>
      </div>
    </div>
  </div>
`;

export interface Arcade {
  /** Resolves when the player asks to leave. */
  exit: Promise<void>;
  destroy(fade: boolean): Promise<void>;
}

export function openArcade({ fade }: { fade: boolean }): Arcade {
  const root = document.createElement('div');
  root.className = 'egg-arcade';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Bug Hunt, a hidden game');
  root.innerHTML = TEMPLATE;
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
    over: ({ score, round, best, record }) => {
      $('[data-over-kicker]').textContent = record ? 'New best' : 'Game over';
      $('[data-over-title]').textContent = `Fell on round ${round}.`;
      $('[data-over-copy]').textContent = `Score ${score.toLocaleString()} · best ${best.toLocaleString()}`;
      setTimeout(() => game.mode === 'over' && show('over'), 200);
    },
  });

  const hearts = $('[data-hearts]');
  let heartCount = -1;
  function renderHud(h: Hud) {
    const idle = game.mode === 'attract';
    $('[data-round]').textContent = idle ? '--' : pad(h.round, 2);
    $('[data-score]').textContent = pad(h.score, 5);
    $('[data-best]').textContent = pad(h.best, 5);
    if (heartCount !== h.maxHp) {
      hearts.innerHTML = Array.from({ length: h.maxHp }, () => `<span class="ea-heart">${HEART_SVG}</span>`).join('');
      heartCount = h.maxHp;
    }
    const hp = idle ? h.maxHp : h.hp;
    Array.from(hearts.children).forEach((el, i) => el.classList.toggle('is-empty', i >= hp));
    hearts.setAttribute('aria-label', `Health ${hp} of ${h.maxHp}`);
    const mult = $('[data-mult]');
    mult.hidden = h.mult < 2;
    mult.textContent = `×${h.mult}`;
    root.classList.toggle('is-rapid', h.rapid);
  }

  const start = () => {
    show(null);
    root.classList.add('is-playing');
    game.start();
  };
  const toMenu = () => {
    game.attract();
    root.classList.remove('is-playing');
    show('menu');
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
    if (t.hasAttribute('data-start')) start();
    else if (t.hasAttribute('data-resume')) resume();
    else if (t.hasAttribute('data-menu')) toMenu();
    else if (t.hasAttribute('data-exit')) leave();
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
    if (e.code === 'KeyM') return void (setMuted(!isMuted()), syncMute());
    if (game.mode === 'paused' && (e.code === 'Escape' || e.code === 'KeyP')) return void (e.preventDefault(), resume());
    if (e.code === 'Escape') return void (e.preventDefault(), leave());
    // Enter starts from the menu or game-over screen unless a button has focus
    // (then the button's own action runs).
    if (e.code === 'Enter' && (game.mode === 'attract' || game.mode === 'over')) {
      if (!(document.activeElement instanceof HTMLButtonElement)) (e.preventDefault(), start());
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
  const ro = new ResizeObserver(() => {
    const k = Math.max(1, Math.round((frame.clientWidth * (window.devicePixelRatio || 1)) / VIEW_W));
    game.resize(k);
  });
  ro.observe(frame);

  requestAnimationFrame(() => {
    root.classList.add('is-in');
    show('menu');
  });

  return {
    exit,
    destroy: (fadeOut) =>
      new Promise<void>((resolve) => {
        const done = () => {
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
