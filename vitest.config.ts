import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { aliases } from './config/aliases';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: aliases },
  define: { 'import.meta.env.VITE_MOCK': JSON.stringify('1') },
  test: {
    globals: true,
    include: ['packages/**/*.{test,spec}.{ts,tsx}', 'src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'node',
    environmentMatchGlobs: [['src/**/*.test.tsx', 'jsdom']],
    setupFiles: ['./src/test/setup.ts'],
    // Component tests render whole pages (MSW, Dexie); under a parallel full run 5 s is too tight.
    testTimeout: 20_000,
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['packages/*/src/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
      exclude: ['**/*.{test,spec}.{ts,tsx}', 'packages/**/fixtures/**', 'src/main.tsx', 'src/mocks/**'],
    },
  },
});
