import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// GitHub Pages serves project sites from /<repo>/, so the build needs that
// prefix. The deploy workflow sets BASE_PATH; local builds serve from root.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [svelte()],
  build: { target: 'es2022' },
  // In development the API is the Worker in apps/server (`npm run dev:server`), on 8787.
  server: { proxy: { '/api': 'http://localhost:8787' } },
});
