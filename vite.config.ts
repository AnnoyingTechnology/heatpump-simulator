import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // A source edit must not silently reload the page and destroy an ongoing physical run.
  // Refresh explicitly to load a new development version.
  server: { hmr: false, watch: { ignored: ['**/.qa-browser/**', '**/research/**', '**/tools/**'] } },
});
