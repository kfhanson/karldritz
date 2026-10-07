// A picture of the viewport for the glass to shatter.
//
// The page is serialised into an SVG <foreignObject> together with its own
// stylesheets, so the browser renders it exactly as it renders the real page.
// An SVG image can't load anything itself, so fonts and on-screen images are
// inlined as data URLs first. All of that is network and encoding work; the
// main thread only pays for one clone, one serialise and one decode.

const TRANSPARENT = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// Freeze every animation on its last frame and drop transitions.
const FREEZE = `*,*::before,*::after{animation-delay:-1ms!important;animation-duration:1ms!important;animation-iteration-count:1!important;animation-play-state:running!important;transition:none!important}`;

const inlined = new Map<string, Promise<string>>();

function dataUrl(url: string): Promise<string> {
  let p = inlined.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${url}`);
        return r.blob();
      })
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result as string);
            fr.onerror = () => reject(fr.error);
            fr.readAsDataURL(blob);
          }),
      );
    p.catch(() => inlined.delete(url));
    inlined.set(url, p);
  }
  return p;
}

const URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;

async function inlineUrls(css: string, base: string): Promise<string> {
  const urls = new Set<string>();
  for (const m of css.matchAll(URL_RE)) if (!/^(data:|#)/.test(m[2])) urls.add(m[2]);
  const map = new Map<string, string>();
  await Promise.all(
    [...urls].map(async (u) => {
      try {
        map.set(u, await dataUrl(new URL(u, base).href));
      } catch {
        /* leave it; it just won't render in the snapshot */
      }
    }),
  );
  return css.replace(URL_RE, (all, _q, u) => (map.has(u) ? `url("${map.get(u)}")` : all));
}

// Google Fonts ships a face per script (cyrillic, greek, vietnamese…).
// The page is Latin, so only the Latin faces are worth inlining.
function latinFacesOnly(css: string): string {
  return css.replace(/@font-face\s*{[^}]*}/g, (face) =>
    !/unicode-range/.test(face) || /U\+0000-00FF/i.test(face) ? face : '',
  );
}

async function collectCss(): Promise<string> {
  const parts = Array.from(document.styleSheets).map(async (sheet) => {
    if (sheet.disabled) return '';
    try {
      const text = Array.from(sheet.cssRules, (r) => r.cssText).join('\n');
      return inlineUrls(latinFacesOnly(text), sheet.href ?? location.href);
    } catch {
      // Cross-origin sheet (the font CSS): its rules can't be read, but it can be fetched.
      if (!sheet.href) return '';
      try {
        const text = await (await fetch(sheet.href)).text();
        return inlineUrls(latinFacesOnly(text), sheet.href);
      } catch {
        return '';
      }
    }
  });
  return (await Promise.all(parts)).join('\n');
}

function visible(r: DOMRect) {
  return r.width > 0 && r.height > 0 && r.bottom > -100 && r.top < innerHeight + 100 && r.right > 0 && r.left < innerWidth;
}

/** Stand-in <img> for a canvas or video, sized and styled like the original. */
function stillOf(orig: HTMLElement, clone: HTMLElement, src: string): HTMLImageElement {
  const img = document.createElement('img');
  for (const a of Array.from(clone.attributes)) if (a.name === 'class' || a.name === 'style') img.setAttribute(a.name, a.value);
  const r = orig.getBoundingClientRect();
  img.style.width = `${r.width}px`;
  img.style.height = `${r.height}px`;
  img.style.objectFit = getComputedStyle(orig).objectFit;
  img.src = src;
  return img;
}

function frameOf(el: HTMLCanvasElement | HTMLVideoElement): string | null {
  try {
    if (el instanceof HTMLCanvasElement) {
      // A WebGL canvas reads back blank outside its own frame: draw one now.
      const gl = el.getContext('webgl');
      if (gl) gl.drawArrays(gl.TRIANGLES, 0, 6);
      return el.toDataURL('image/jpeg', 0.9); // soft noise: JPEG is fine, and far quicker to encode
    }
    if (el.readyState < 2) return null;
    const c = document.createElement('canvas');
    c.width = el.videoWidth;
    c.height = el.videoHeight;
    c.getContext('2d')!.drawImage(el, 0, 0);
    return c.toDataURL('image/jpeg', 0.85);
  } catch {
    return null;
  }
}

async function cloneBody(): Promise<HTMLElement> {
  const body = document.body;
  const clone = body.cloneNode(true) as HTMLElement;
  // cloneNode keeps document order, so the two lists pair up one to one.
  const orig = Array.from(body.querySelectorAll<HTMLElement>('*'));
  const copy = Array.from(clone.querySelectorAll<HTMLElement>('*'));
  const pending: Promise<void>[] = [];

  orig.forEach((o, i) => {
    const c = copy[i];
    const tag = o.localName;
    if (tag === 'script' || tag === 'noscript' || tag === 'template' || o.classList.contains('skip-link')) {
      c.remove();
    } else if (tag === 'source' && o.parentElement?.localName === 'picture') {
      c.remove();
    } else if (tag === 'canvas' || tag === 'video') {
      const r = o.getBoundingClientRect();
      const still = visible(r) ? frameOf(o as HTMLCanvasElement | HTMLVideoElement) : null;
      const poster = tag === 'video' ? (o as HTMLVideoElement).poster : '';
      const img = stillOf(o, c, still ?? TRANSPARENT);
      if (!still && poster && visible(r)) pending.push(dataUrl(poster).then((d) => void (img.src = d)).catch(() => {}));
      c.replaceWith(img);
    } else if (tag === 'img') {
      const img = c as HTMLImageElement;
      const src = (o as HTMLImageElement).currentSrc || (o as HTMLImageElement).src;
      img.removeAttribute('srcset');
      img.removeAttribute('sizes');
      img.removeAttribute('loading');
      const r = o.getBoundingClientRect();
      if (src && visible(r)) {
        img.src = TRANSPARENT;
        pending.push(dataUrl(src).then((d) => void (img.src = d)).catch(() => {}));
      } else {
        // Off screen: keep its box, skip the bytes.
        img.style.width = `${r.width}px`;
        img.style.height = `${r.height}px`;
        img.src = TRANSPARENT;
      }
    }
  });

  await Promise.all(pending);
  return clone;
}

const xmlAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Renders the current viewport into a canvas at `scale` device pixels per CSS pixel. */
export async function snapshot(scale: number): Promise<HTMLCanvasElement> {
  const w = innerWidth;
  const h = innerHeight;
  const sy = scrollY;
  const [css, body] = await Promise.all([collectCss(), cloneBody()]);

  // Scroll by shifting the body; position:relative (unlike a transform)
  // leaves the fixed nav pinned to the top of the frame. Inside the SVG the
  // body's overflow no longer passes to the viewport, so it would clip itself
  // to one screen — let it run long instead.
  body.style.position = 'relative';
  body.style.top = `${-sy}px`;
  body.style.margin = '0';
  body.style.height = 'auto';
  body.style.overflow = 'visible';
  const root = document.documentElement;
  const attrs = Array.from(root.attributes, (a) => `${a.name}="${xmlAttr(a.value)}"`).join(' ');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<foreignObject x="0" y="0" width="100%" height="100%">` +
    `<html xmlns="http://www.w3.org/1999/xhtml" ${attrs}><head><style><![CDATA[${css.replace(/]]>/g, '')}${FREEZE}]]></style></head>` +
    new XMLSerializer().serializeToString(body) +
    `</html></foreignObject></svg>`;

  // A data: URL rather than a blob: one, so the canvas stays readable.
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();

  const out = document.createElement('canvas');
  out.width = Math.round(w * scale);
  out.height = Math.round(h * scale);
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = getComputedStyle(document.body).backgroundColor || '#F6F5F1';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(img, 0, 0, out.width, out.height);
  return out;
}
