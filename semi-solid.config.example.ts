import type { SemiSolidConfig } from '@semi-solid/compiler/cli/config';

export default {
  brands: {
    'brand-a': {
      locales: ['en', 'fr'],
      // store: 'your-store.myshopify.com',
      // storePassword: 'your-password',
    },
    'brand-b': { locales: ['en', 'de'] },
    'brand-c': { locales: ['en'] },
  },
} satisfies SemiSolidConfig;
