import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { watch: { ignored: ['**/.qa-browser/**', '**/research/**', '**/tools/**'] } },
});
