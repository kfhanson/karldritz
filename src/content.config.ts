import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// One MDX file per project under src/content/projects/. The filename (minus
// extension) is the entry id, which doubles as the URL slug.
const projects = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/projects' }),
  schema: ({ image }) => {
    // A media item is either an image (bare path) or a video. Videos live under
    // public/ — `src`/`webm` are paths like 'videos/demo.mp4'; `poster` is an
    // imported image shown while paused / under reduced-motion.
    const media = z.union([
      image(),
      z.object({
        src: z.string(),
        webm: z.string().optional(),
        poster: image().optional(),
      }),
    ]);

    return z.object({
      title: z.string(),
      category: z.string(),
      // Drives which case-study structure the body follows and the header tag:
      // 'research' = technical argument, 'competition' = journey story,
      // 'project' = generic (no tag shown).
      type: z.enum(['research', 'competition', 'project']).default('project'),
      year: z.string(),
      role: z.string().default('Developer'),
      // Short blurb used on the home grid and as the meta description.
      summary: z.string(),
      // Grid card + social/OG preview — image only.
      thumbnail: image(),
      // Grid card crossfades / plays this on hover — image OR video.
      hoverThumbnail: media.optional(),
      // Case-study carousel, in order — images and/or videos, independent of the
      // thumbnails (reuse the same asset or add new ones). Only the centred
      // card's video plays. Falls back to `thumbnail` when empty.
      gallery: z.array(media).default([]),
      techStack: z.array(z.string()).default([]),
      // Headline stats rendered as callout cards above the write-up.
      metrics: z
        .array(z.object({ value: z.string(), label: z.string() }))
        .default([]),
      featured: z.boolean().default(false),
      hidden: z.boolean().default(false),
      // Explicit display order (grid + next-project cycling).
      order: z.number(),
      link: z.string().url().optional(),
      github: z.string().url().optional(),
      paper: z.string().url().optional(),
      // Extra labeled links — competition pages, articles, videos, decks, etc.
      links: z
        .array(z.object({ label: z.string(), url: z.string().url() }))
        .default([]),
    });
  },
});

export const collections = { projects };
