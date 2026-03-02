import { defineCommand } from 'citty';
import { loadConfig } from '../config.js';
import { runBuild } from '../vite-bridge.js';

export const buildAllCommand = defineCommand({
  meta: {
    name: 'build-all',
    description: 'Build all brand/locale combos from config',
  },
  args: {
    parallel: {
      type: 'boolean',
      description: 'Run builds in parallel',
      default: false,
    },
    concurrency: {
      type: 'string',
      description: 'Max parallel builds (requires --parallel)',
      default: '3',
    },
  },
  async run({ args }) {
    const config = await loadConfig(process.cwd());
    const pairs: Array<{ brand: string; locale: string }> = [];

    for (const [brand, brandConfig] of Object.entries(config.brands)) {
      for (const locale of brandConfig.locales) {
        pairs.push({ brand, locale });
      }
    }

    if (pairs.length === 0) {
      console.log('No brand/locale pairs found in config.');
      return;
    }

    console.log(`Building ${pairs.length} combo(s)...`);

    if (args.parallel) {
      const concurrency = parseInt(args.concurrency, 10) || 3;
      // Simple concurrency pool
      const queue = [...pairs];
      const running: Promise<void>[] = [];

      while (queue.length > 0 || running.length > 0) {
        while (running.length < concurrency && queue.length > 0) {
          const pair = queue.shift()!;
          const task = (async () => {
            console.log(`  Building ${pair.brand}/${pair.locale}...`);
            await runBuild(pair);
            console.log(`  Done: ${pair.brand}/${pair.locale}`);
          })();
          running.push(task);
        }
        if (running.length > 0) {
          await Promise.race(running);
          // Remove settled promises
          for (let i = running.length - 1; i >= 0; i--) {
            const settled = await Promise.race([
              running[i].then(() => true),
              Promise.resolve(false),
            ]);
            if (settled) running.splice(i, 1);
          }
        }
      }
    } else {
      for (const pair of pairs) {
        console.log(`  Building ${pair.brand}/${pair.locale}...`);
        await runBuild(pair);
        console.log(`  Done: ${pair.brand}/${pair.locale}`);
      }
    }

    console.log(`All ${pairs.length} builds complete.`);
  },
});
