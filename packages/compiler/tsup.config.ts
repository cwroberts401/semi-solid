import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli/config.ts', 'src/cli/index.ts', 'src/cli/bin.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  onSuccess: async () => {
    const { readFile, writeFile } = await import('node:fs/promises');
    const binPath = 'dist/cli/bin.js';
    const content = await readFile(binPath, 'utf-8');
    await writeFile(binPath, `#!/usr/bin/env node\n${content}`);
  },
});
