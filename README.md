# Semi-Solid

Write Shopify themes in SolidJS. The compiler transforms your JSX components into `.liquid` templates at build time while preserving full client-side interactivity through selective hydration.

```tsx
import { tap } from '$lib/runtime';

const title = tap('{{ product.title }}', 'Default Title');

return <h1>{title}</h1>;
```

Compiles to:

```liquid
<h1>{{ product.title }}</h1>
```

The `tap()` call bridges two worlds: Liquid handles server-side rendering on Shopify's CDN, while the fallback value drives your SolidJS components during development, testing, and client-side hydration.

## Architecture

```
@semi-solid/runtime     Zero-dependency stubs (tap, tapWhen, t, etc.)
       |
@semi-solid/solid       SolidJS reactive layer (signals, effects, stores)
       |
  Components            Your JSX — snippets, sections, blocks
       |
@semi-solid/compiler    Vite plugin — JSX → .liquid at build time
```

The compiler reads your raw JSX source, extracts every `tap()` mapping, and emits two outputs per component:

1. **A `.liquid` file** with all JSX translated to Liquid tags
2. **Cleaned JS source** passed to Vite/SolidJS for the client bundle

## Project structure

```
semi-solid/
├── packages/
│   ├── runtime/              @semi-solid/runtime — stubs + types
│   ├── solid/                @semi-solid/solid   — SolidJS reactive runtime
│   └── compiler/             @semi-solid/compiler — Vite plugin
│
├── src/
│   ├── routes/               Layouts (JSX → Liquid)
│   │   └── +layout.tsx       → layout/theme.liquid
│   ├── snippets/             Reusable components → snippets/*.liquid
│   ├── sections/             Shopify sections (with schema) → sections/*.liquid
│   ├── blocks/               Section blocks → rendered inside sections
│   ├── templates/            JSON page templates → templates/*.json
│   └── brands/               Per-brand overrides (components, i18n, theme)
│       ├── brand-a/
│       └── brand-b/
│
└── dist/{brand}/{locale}/    Complete Shopify theme output
```

Component categories mirror Shopify's file structure. The compiler writes each component to the matching output directory (`snippets/`, `sections/`, etc.).

## Quick start

```bash
pnpm install

# Dev — compile + Shopify theme preview
pnpm dev

# Build a single brand/locale
pnpm semi-solid build --brand brand-a --locale en

# Build all brand/locale combos
pnpm semi-solid build-all

# Run tests
pnpm test
```

## CLI

All build commands go through the `semi-solid` CLI (provided by `@semi-solid/compiler`).

### `semi-solid build`

Build a single brand/locale combination. Sets `BRAND`/`LOCALE` env vars and calls Vite's programmatic `build()`, which auto-loads `vite.config.ts`.

```bash
pnpm semi-solid build --brand brand-a --locale en
```

Output goes to `dist/{brand}/{locale}/`.

### `semi-solid build-all`

Build every brand/locale pair defined in `semi-solid.config.ts`. Runs sequentially by default.

```bash
pnpm semi-solid build-all
pnpm semi-solid build-all --parallel --concurrency 4
```

### `semi-solid dev`

Start a Vite watch build and Shopify theme dev server together. Store URL and password come from `semi-solid.config.ts`.

```bash
pnpm semi-solid dev --brand brand-a --locale en
pnpm semi-solid dev --brand brand-a --locale en --store my-store.myshopify.com
pnpm semi-solid dev --brand brand-a --locale en --no-shopify   # watch only
```

### `semi-solid backfill`

Regenerate specific outputs without a full Vite build.

```bash
pnpm semi-solid backfill --brand brand-a --locale en --target locales,templates,scaffold
```

| Target | What it does |
|--------|-------------|
| `locales` | Copy `src/brands/{brand}/i18n/*.json` to `dist/{brand}/{locale}/locales/` |
| `templates` | Copy `src/templates/*.json` (with brand overrides) to `dist/templates/` |
| `scaffold` | Write required Shopify files (`config/`, `layout/theme.liquid`, `gift_card.liquid`) |

### Configuration

The brand/locale matrix lives in `semi-solid.config.ts` at the project root:

```ts
import type { SemiSolidConfig } from '@semi-solid/compiler/cli/config';

export default {
  brands: {
    'brand-a': {
      locales: ['en', 'fr'],
      store: 'my-store.myshopify.com',
      storePassword: 'password',
    },
    'brand-b': { locales: ['en', 'de'] },
  },
} satisfies SemiSolidConfig;
```

If no config file exists, brands and locales are auto-discovered from `src/brands/*/i18n/*.json`.

## Core API

### `tap(liquidExpr, fallback)`

Static server-side mapping. Returns the fallback at runtime; the compiler replaces the call site with the Liquid expression in the `.liquid` output.

```tsx
const price = tap('{{ product.price | money }}', '$0.00');
```

TypeScript assertions are supported — the compiler strips them:

```tsx
const options = tap('{{ product.options_with_values }}', []) as ProductOption[];
```

### `tapWhen(liquidExpr, deps, fallback)`

Reactive tap. Same Liquid SSR as `tap()`, but also creates a SolidJS signal that re-fetches from a Shopify data section whenever any dependency signal changes.

```tsx
const price = tapWhen('{{ product.price | money }}', [variantId], props.price ?? '$0.00');
```

When `variantId` changes, the runtime fetches the updated price via the Section Rendering API — no full page reload.

### `tapPersonalized(url, params, fallback)`

Fetches personalized data from an external API. The compiler generates `<link rel="preconnect">` and an inline prefetch script so the request starts before JS parses.

```tsx
const recs = tapPersonalized('/api/recs', { customerId, tags }, []);
```

### `tapRemote(Component, url)`

Renders a component from a different route via the Section Rendering API. Returns reactive HTML that updates if the URL is a signal.

```tsx
const featuredHtml = tapRemote(FeaturedProduct, '/collections/featured');
```

### `liquidRaw(liquidStr)`

Injects raw Liquid into the template. Used for Shopify-specific tags that have no JSX equivalent.

```tsx
<head>{liquidRaw('{{ content_for_header }}')}</head>
```

### `t(key, fallback?)`

Translation helper. Compiles to Shopify's `{{ key | t }}` Liquid filter.

```tsx
<button>{t('product.add_to_cart')}</button>
```

### `blockAttrs()`

Spread onto block elements. Compiles to `{{ block.shopify_attributes }}`.

```tsx
<div {...blockAttrs()}>{/* block content */}</div>
```

### `createStore(key, options?)`

localStorage-backed reactive store for client-side persistence (wishlists, recently viewed). This is the one API you call directly — all others are compiler-transformed.

```tsx
const recentlyViewed = createStore<Product>('recently-viewed', { maxItems: 10 });
recentlyViewed.add(product);
const items = recentlyViewed.items(); // Accessor<Product[]>
```

## Control flow

SolidJS control flow components compile to Liquid equivalents:

| SolidJS | Liquid |
|---------|--------|
| `<Show when={available}>` | `{% if product.available %}` |
| `<For each={products}>` | `{% for product in collection.products %}` |
| `<Match>` / `<Case>` | `{% case %}` / `{% when %}` |

```tsx
<Show when={available} fallback={<span>{t('product.sold_out')}</span>}>
  <button>{t('product.add_to_cart')}</button>
</Show>
```

## Sections and blocks

Export a `schema` constant to turn a component into a Shopify section with `{% schema %}`:

```tsx
// src/sections/ProductSection.tsx
export const schema = {
  name: 'Product',
  tag: 'section',
  blocks: [
    { type: 'title', name: 'Title', limit: 1 },
    { type: 'price', name: 'Price', limit: 1 },
    { type: 'buy_buttons', name: 'Buy buttons', limit: 1 },
  ],
  presets: [{ name: 'Product', blocks: [{ type: 'title' }, { type: 'price' }] }],
} as const;
```

Reference sections from JSON templates:

```json
// src/templates/product.json
{
  "sections": {
    "main": { "type": "product-section" }
  },
  "order": ["main"]
}
```

## Multi-brand support

Override any component, translation, or theme token per brand:

```
src/brands/brand-a/
  snippets/ProductCard.tsx    # Overrides base src/snippets/ProductCard.tsx
  i18n/en.json                # Brand-specific translations
  theme.css                   # Tailwind entry with brand design tokens
```

The brand resolver checks `src/brands/{brand}/snippets/` first, falling back to `src/snippets/`. No changes needed in importing components — the `$snippets/`, `$sections/`, and `$blocks/` aliases handle resolution automatically.

Build a specific brand and locale:

```bash
pnpm semi-solid build --brand brand-a --locale en
pnpm semi-solid build --brand brand-a --locale fr
pnpm semi-solid build --brand brand-b --locale en
```

Each combination outputs a complete Shopify theme to `dist/{brand}/{locale}/`.

## Hydration

Not every component ships JavaScript. The compiler detects which components are interactive (event listeners, signals, effects) and only hydrates those:

1. Liquid SSR renders: `<div data-component="AddToCartButton" data-props='{"variantId":123}'>`
2. `theme.entry.js` queries all `[data-component]` elements at page load
3. Each element is mounted as a SolidJS island with props from `data-props`
4. Static components (ProductCard, HeaderMenu) render as pure Liquid with zero JS

## Vite plugin configuration

```ts
// vite.config.ts
import { semiSolidPlugin } from '@semi-solid/compiler';

export default defineConfig({
  plugins: [
    semiSolidPlugin({
      brand: 'brand-a',
      locale: 'en',
      outDir: 'dist/brand-a/en',
      personalization: {                    // optional
        baseUrl: 'https://api.myapp.com',
        preconnect: true,
        prefetch: true,
      },
    }),
    solidPlugin(),
  ],
  resolve: {
    alias: {
      '$lib': '/packages/solid/src',
      '$snippets': '/src/snippets',
      '$sections': '/src/sections',
      '$blocks': '/src/blocks',
      '$brand': '/src/brands/brand-a',
    },
  },
});
```

## Build output

```
dist/brand-a/en/
  layout/theme.liquid           Root template
  snippets/product-card.liquid  Component templates
  sections/product-section.liquid
  templates/product.json        Page templates (copied from src)
  assets/theme.entry.js         Hydration bundle
  assets/theme.css              Tailwind output
  locales/en.json               Translations
  manifest.json                 Build manifest
```

## Development

```bash
pnpm install                    # Install dependencies
pnpm test                       # Run all tests
pnpm test:watch                 # Watch mode
pnpm dev                        # Compile + Shopify theme preview
pnpm dev:watch                  # Watch only (no Shopify CLI)
pnpm build:all                  # Build all brand/locale combos
pnpm storybook                  # Component development
```
