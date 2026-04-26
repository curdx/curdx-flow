import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  outExtension: () => ({ js: '.mjs' }),
  target: 'node20',
  clean: true,
  shims: false,
  splitting: false,
  sourcemap: false,
  minify: false,
  dts: false,
  banner: { js: '#!/usr/bin/env node' },
});
