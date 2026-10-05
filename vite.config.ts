/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'build',
    target: ['chrome111', 'edge111', 'firefox114', 'safari16.4'],
  },
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    pool: 'vmThreads',
    include: ['sources/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['./sources/test-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['sources/**/*.{ts,tsx}'],
      exclude: [
        'sources/**/*.test.{ts,tsx}',
        'sources/**/*.worker.ts',
        'sources/test-setup.ts',
        'sources/types/**',
      ],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 95,
        lines: 95,
      },
    },
  },
});
