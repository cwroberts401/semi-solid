import { defineCommand } from 'citty';
import fs from 'node:fs';
import path from 'node:path';

export const initCommand = defineCommand({
  meta: {
    name: 'init',
    description: 'Scaffold a new semi-solid project',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Project/brand name (default: current directory name)',
      required: false,
    },
    dir: {
      type: 'string',
      description: 'Target directory (default: .)',
      default: '.',
    },
    force: {
      type: 'boolean',
      description: 'Overwrite existing files',
      default: false,
    },
  },
  async run({ args }) {
    const dir = path.resolve(args.dir);
    const name = (args.name as string | undefined) || path.basename(dir);

    // Check if directory is non-empty
    if (fs.existsSync(dir)) {
      const entries = fs.readdirSync(dir).filter((e) => e !== '.git');
      if (entries.length > 0 && !args.force) {
        console.error(
          `Error: Directory "${dir}" is not empty. Use --force to overwrite.`,
        );
        process.exit(1);
      }
    }

    // Create directory structure
    const dirs = [
      '',
      'src/routes',
      'src/sections',
      'src/snippets',
      'src/blocks',
      'src/templates',
      'src/theme/snippets',
      `src/brands/${name}/i18n`,
    ];

    for (const d of dirs) {
      fs.mkdirSync(path.join(dir, d), { recursive: true });
    }

    // Write all scaffold files
    const files: Record<string, string> = {
      'package.json': packageJson(name),
      'vite.config.ts': viteConfig(name),
      'semi-solid.config.ts': semiSolidConfig(name),
      'tsconfig.json': tsConfig(),
      'src/routes/+layout.tsx': layoutTsx(),
      'src/sections/ProductDetails.tsx': productDetailsTsx(),
      'src/templates/index.json': indexTemplate(),
      'src/templates/product.json': productTemplate(),
      [`src/brands/${name}/theme.css`]: themeCss(),
      [`src/brands/${name}/theme.ts`]: themeTs(),
      [`src/brands/${name}/i18n/en.json`]: i18nEn(),
      'src/theme/snippets/css-variables.liquid': cssVariablesLiquid(),
    };

    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = path.join(dir, filePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);
    }

    const relDir = path.relative(process.cwd(), dir) || '.';
    console.log(`\nCreated semi-solid project in ./${relDir}\n`);
    console.log('Next steps:');
    if (relDir !== '.') {
      console.log(`  cd ${relDir}`);
    }
    console.log('  pnpm install');
    console.log('  pnpm build');
    console.log();
  },
});

// ---------------------------------------------------------------------------
// Template helpers
// ---------------------------------------------------------------------------

function packageJson(name: string): string {
  return JSON.stringify(
    {
      name,
      private: true,
      type: 'module',
      scripts: {
        dev: `semi-solid dev --brand ${name} --locale en`,
        build: `semi-solid build --brand ${name} --locale en`,
        'build:all': 'semi-solid build-all',
      },
      dependencies: {
        '@semi-solid/runtime': '^0.1.0',
        '@semi-solid/solid': '^0.1.0',
        'solid-js': '^1.9.0',
      },
      devDependencies: {
        '@semi-solid/compiler': '^0.1.0',
        '@tailwindcss/vite': '^4.0.0',
        tailwindcss: '^4.0.0',
        vite: '^5.4.0',
        'vite-plugin-solid': '^2.10.0',
      },
    },
    null,
    2,
  ) + '\n';
}

function viteConfig(name: string): string {
  return `import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import solidPlugin from 'vite-plugin-solid';
import { semiSolidPlugin, createBrandResolver } from '@semi-solid/compiler';

const brand = process.env.BRAND || '${name}';
const locale = process.env.LOCALE || 'en';
const outDir = \`dist/\${brand}/\${locale}\`;

export default defineConfig({
  plugins: [
    tailwindcss(),
    createBrandResolver(brand),
    semiSolidPlugin({ brand, locale, outDir }),
    solidPlugin(),
  ],
  resolve: {
    alias: {
      '$lib': '@semi-solid/solid',
      '$snippets': '/src/snippets',
      '$sections': '/src/sections',
      '$blocks': '/src/blocks',
      '$brand': \`/src/brands/\${brand}\`,
    },
  },
  build: {
    outDir,
    emptyOutDir: false,
    rollupOptions: {
      input: {
        layout: 'src/routes/+layout.tsx',
        'theme.entry': 'virtual:semi-solid/hydration-entry',
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
`;
}

function semiSolidConfig(name: string): string {
  return `import type { SemiSolidConfig } from '@semi-solid/compiler/cli/config';

export default {
  brands: {
    '${name}': { locales: ['en'] },
  },
} satisfies SemiSolidConfig;
`;
}

function tsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        jsx: 'preserve',
        jsxImportSource: 'solid-js',
        skipLibCheck: true,
        paths: {
          '$lib/*': ['./node_modules/@semi-solid/solid/src/*'],
        },
      },
      include: ['src/**/*', 'vite.config.ts'],
      exclude: ['node_modules', 'dist'],
    },
    null,
    2,
  ) + '\n';
}

function layoutTsx(): string {
  return `import '$brand/theme.css';
import { tap, liquidRaw } from '$lib/runtime';

interface LayoutProps { children?: unknown; }

export default function Layout(props: LayoutProps) {
  const shopName = tap('{{ shop.name }}', 'My Store');
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{shopName}</title>
        {liquidRaw('{{ content_for_header }}')}
        {liquidRaw("{% render 'theme-assets' %}")}
      </head>
      <body>
        <header><a href="/">{shopName}</a></header>
        <main>{props.children}</main>
      </body>
    </html>
  );
}
`;
}

function productDetailsTsx(): string {
  return `import { tap } from '$lib/runtime';

export const schema = {
  name: 'Product Details',
  tag: 'section',
} as const;

export default function ProductDetails() {
  const title = tap('{{ product.title }}', 'Product Title');
  const price = tap('{{ product.price | money }}', '$0.00');
  return (
    <div>
      <h1>{title}</h1>
      <p>{price}</p>
    </div>
  );
}
`;
}

function indexTemplate(): string {
  return JSON.stringify(
    {
      sections: {
        main: { type: 'index-content' },
      },
      order: ['main'],
    },
    null,
    2,
  ) + '\n';
}

function productTemplate(): string {
  return JSON.stringify(
    {
      sections: {
        details: { type: 'product-details' },
      },
      order: ['details'],
    },
    null,
    2,
  ) + '\n';
}

function themeCss(): string {
  return `@import "tailwindcss";

@source "../../snippets/**/*.tsx";
@source "../../sections/**/*.tsx";
@source "../../blocks/**/*.tsx";
@source "../../routes/**/*.tsx";

@theme {
  --color-primary: #1a1a2e;
  --color-accent: #e94560;
  --color-surface: #ffffff;
  --color-text: #16213e;
  --font-heading: "Playfair Display", serif;
  --font-body: "Inter", sans-serif;
  --radius-card: 4px;
  --radius-button: 2px;
}
`;
}

function themeTs(): string {
  return `export const theme = {
  colors: {
    primary: '#1a1a2e',
    accent: '#e94560',
    background: '#ffffff',
    surface: '#f5f5f5',
    text: '#1a1a2e',
    textMuted: '#6b7280',
  },
  typography: {
    fontFamily: '"Inter", sans-serif',
    headingFamily: '"Playfair Display", serif',
  },
  spacing: {
    cardGap: '1.5rem',
    sectionPadding: '4rem',
  },
} as const;
`;
}

function i18nEn(): string {
  return JSON.stringify(
    {
      product: {
        add_to_cart: 'Add to Cart',
        sold_out: 'Sold Out',
        view_details: 'View Details',
      },
      cart: {
        title: 'Your Cart',
        empty: 'Your cart is empty',
        checkout: 'Checkout',
      },
      general: {
        loading: 'Loading\u2026',
        close: 'Close',
        search: 'Search',
      },
    },
    null,
    2,
  ) + '\n';
}

function cssVariablesLiquid(): string {
  return `{% comment %}
  Snippet: css-variables — outputs CSS custom properties from theme settings.
  Include in layout <head>: {% render 'css-variables' %}
{% endcomment %}

{% style %}
  :root {
    --color-primary: {{ settings.color_primary | default: '#111827' }};
    --color-secondary: {{ settings.color_secondary | default: '#6b7280' }};
    --color-background: {{ settings.color_background | default: '#ffffff' }};
    --color-text: {{ settings.color_text | default: '#111827' }};
    --font-heading: {{ settings.heading_font.family | default: 'inherit' }}, {{ settings.heading_font.fallback_families | default: 'sans-serif' }};
    --font-body: {{ settings.body_font.family | default: 'inherit' }}, {{ settings.body_font.fallback_families | default: 'sans-serif' }};
    --page-width: {{ settings.page_width | default: 1200 }}px;
  }
{% endstyle %}
`;
}
