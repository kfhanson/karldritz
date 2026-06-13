import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://kfhanson.github.io',
  base: '/karldritz',
  integrations: [mdx()],
  vite: {
    plugins: [tailwindcss()],
  },
});
