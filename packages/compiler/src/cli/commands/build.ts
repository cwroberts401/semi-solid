import { defineCommand } from 'citty';
import { runBuild } from '../vite-bridge.js';

export const buildCommand = defineCommand({
  meta: {
    name: 'build',
    description: 'Build a single brand/locale combo',
  },
  args: {
    brand: {
      type: 'string',
      description: 'Brand identifier (e.g. brand-a)',
      required: true,
    },
    locale: {
      type: 'string',
      description: 'Locale identifier (e.g. en)',
      required: true,
    },
  },
  async run({ args }) {
    console.log(`Building ${args.brand}/${args.locale}...`);
    await runBuild({ brand: args.brand, locale: args.locale });
    console.log(`Done: ${args.brand}/${args.locale}`);
  },
});
