import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url'; 

const __dirname = path.dirname(fileURLToPath(import.meta.url)); 

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    css: true,
    include: ['tests/**/*.test.tsx', 'tests/**/*.test.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', '.next'],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'vitest.setup.ts',
        '**/*.config.ts',
        '**/*.config.mts',
        '**/*.d.ts',
      ],
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('development'),
  },
});
