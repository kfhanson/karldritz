import type { ImageMetadata } from 'astro';

// A gallery / hover item as written in frontmatter: a bare image import, an
// image with presentation options, or a video.
export type MediaItem =
  | ImageMetadata
  | { image: ImageMetadata; caption?: string; fit?: 'cover' | 'contain' }
  | { src: string; webm?: string; poster?: ImageMetadata; caption?: string; fit?: 'cover' | 'contain' };

export type NormalizedMedia =
  | { kind: 'image'; image: ImageMetadata; caption?: string; fit: 'cover' | 'contain' }
  | { kind: 'video'; src: string; webm?: string; poster?: ImageMetadata; caption?: string; fit: 'cover' | 'contain' };

export function normalizeMedia(m: MediaItem): NormalizedMedia {
  if ('width' in m) return { kind: 'image', image: m, fit: 'cover' };
  if ('image' in m) return { kind: 'image', image: m.image, caption: m.caption, fit: m.fit ?? 'cover' };
  return { kind: 'video', src: m.src, webm: m.webm, poster: m.poster, caption: m.caption, fit: m.fit ?? 'cover' };
}
