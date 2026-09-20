import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// GitHub Pages serves project sites from /<repo>/, so the build needs that
// prefix. The deploy workflow sets BASE_PATH; local builds serve from root.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [svelte()],
  build: { target: 'es2022' },
});
