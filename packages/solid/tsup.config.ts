import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/runtime.ts',
    'src/i18n.ts',
    'src/store.ts',
    'src/tapWhen.ts',
    'src/tapRemote.ts',
    'src/tapPersonalized.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: true,
  external: ['solid-js', '@semi-solid/runtime'],
});
