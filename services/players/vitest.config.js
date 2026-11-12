import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: ['src/server.js'],
      reporter: ['text', 'lcov'],
      // The course requires at least 70%: `npm run test:coverage` fails below this.
      thresholds: { statements: 70, branches: 70, functions: 70, lines: 70 },
    },
  },
});
