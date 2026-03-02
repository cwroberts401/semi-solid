import { defineCommand } from 'citty';
import { spawn } from 'node:child_process';
import { loadConfig } from '../config.js';
import { runWatchBuild } from '../vite-bridge.js';

export const devCommand = defineCommand({
  meta: {
    name: 'dev',
    description: 'Watch build + Shopify theme dev',
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
    store: {
      type: 'string',
      description: 'Shopify store URL (overrides config)',
    },
    'no-shopify': {
      type: 'boolean',
      description: 'Skip Shopify CLI (watch-only mode)',
      default: false,
    },
  },
  async run({ args }) {
    const brand = args.brand;
    const locale = args.locale;
    const noShopify = args['no-shopify'];

    console.log(`Starting dev for ${brand}/${locale}...`);

    // Start Vite watch build
    const watchPromise = runWatchBuild({ brand, locale });

    // Start Shopify CLI unless --no-shopify
    if (!noShopify) {
      const config = await loadConfig(process.cwd());
      const brandConfig = config.brands[brand];
      const store = args.store || brandConfig?.store;

      if (!store) {
        console.error(
          `No store URL for brand "${brand}". Pass --store or set it in semi-solid.config.ts.`,
        );
        process.exit(1);
      }

      const distPath = `./dist/${brand}/${locale}`;
      const shopifyArgs = ['theme', 'dev', '--path', distPath, '--store', store];

      if (brandConfig?.storePassword) {
        shopifyArgs.push('--store-password', brandConfig.storePassword);
      }

      console.log(`Starting Shopify CLI: shopify ${shopifyArgs.join(' ')}`);

      const shopify = spawn('shopify', shopifyArgs, {
        stdio: 'inherit',
        shell: true,
      });

      shopify.on('error', (err) => {
        console.error(`Shopify CLI error: ${err.message}`);
      });

      shopify.on('close', (code) => {
        if (code !== 0) {
          console.error(`Shopify CLI exited with code ${code}`);
        }
      });
    }

    await watchPromise;
  },
});
