import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/hooks/**/*.test.ts'],
    pool: 'forks',
    testTimeout: 5000,
  },
});
