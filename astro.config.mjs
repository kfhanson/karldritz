import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://kfhanson.github.io',
  base: '/karldritz',
  vite: {
    plugins: [tailwindcss()],
  },
});
