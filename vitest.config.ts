import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '$lib': path.join(dirname, 'packages/solid/src'),
      '$snippets': path.join(dirname, 'src/snippets'),
      '$sections': path.join(dirname, 'src/sections'),
      '$blocks': path.join(dirname, 'src/blocks'),
      '$brand': path.join(dirname, 'src/brands/brand-a'),
    },
  },
  test: {
    projects: [
      // Existing unit tests (jsdom)
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['packages/*/tests/**/*.test.ts'],
          environment: 'jsdom',
        },
      },
      // Storybook component tests (browser via Playwright)
      {
        extends: true,
        plugins: [
          storybookTest({ configDir: path.join(dirname, '.storybook') }),
        ],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: 'playwright',
            instances: [{ browser: 'chromium' }],
          },
          setupFiles: [path.join(dirname, '.storybook/vitest.setup.ts')],
        },
      },
    ],
  },
});
