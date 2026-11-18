import { defineConfig } from 'vite';

// `base: './'` makes the build work from any sub-path, e.g.
// https://<user>.github.io/<repo>/ on GitHub Pages, as well as Netlify roots.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600, // MapLibre alone is ~1 MB minified
  },
  server: { host: true }, // expose on LAN so you can test on a phone
});
