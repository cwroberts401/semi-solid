# @semi-solid/compiler

Build toolchain for Semi-Solid. Transforms SolidJS components into Shopify Liquid templates with a Vite plugin and a CLI for building, developing, and deploying multi-brand themes.

## Install

```bash
pnpm add -D @semi-solid/compiler
```

## CLI

### `semi-solid build --brand <name> --locale <code>`

Build a single brand/locale combination.

```bash
semi-solid build --brand brand-a --locale en
```

### `semi-solid build-all [--parallel] [--concurrency N]`

Build all brand/locale combinations from `semi-solid.config.ts`. Defaults to 3 concurrent builds.

```bash
semi-solid build-all --parallel --concurrency 5
```

### `semi-solid dev --brand <name> --locale <code> [--store URL] [--no-shopify]`

Watch build with optional Shopify theme dev server integration.

```bash
semi-solid dev --brand brand-a --locale en
semi-solid dev --brand brand-a --locale en --no-shopify  # skip Shopify CLI
```

### `semi-solid init [name] [--dir PATH] [--force]`

Scaffold a new Semi-Solid project with directory structure, config, and example components.

```bash
semi-solid init my-theme
```

### `semi-solid backfill --brand <name> --locale <code> --target <targets>`

Targeted regeneration of specific outputs without a full rebuild.

```bash
semi-solid backfill --brand brand-a --locale en --target locales,templates
```

## Vite Plugin

```ts
// vite.config.ts
import { semiSolidPlugin } from '@semi-solid/compiler';

export default {
  plugins: [semiSolidPlugin()],
};
```

The plugin intercepts `.tsx`/`.jsx` files during build to:

- Extract `tap()` / `tapWhen()` / `tapPersonalized()` mappings to Liquid expressions
- Generate `.liquid` template files
- Emit hydration data sections for client-side reactivity
- Generate CSS/JS asset includes

## Config

Create `semi-solid.config.ts` in the project root:

```ts
import type { SemiSolidConfig } from '@semi-solid/compiler/cli/config';

export default {
  brands: {
    'brand-a': { locales: ['en', 'fr'] },
    'brand-b': { locales: ['en', 'de'] },
  },
} satisfies SemiSolidConfig;
```

## Architecture

```
@semi-solid/runtime   (zero deps — stubs + types)
       │
@semi-solid/solid     (solid-js — reactive implementations)
       │
  Components          (import via $lib/ alias)
       │
@semi-solid/compiler  ← you are here (Vite plugin + CLI)
```

The compiler reads component source code that uses `@semi-solid/runtime` stubs, extracts Liquid expressions, and generates optimized `.liquid` output alongside JS bundles for client-side hydration.

## Development

```bash
pnpm test        # run tests
pnpm test:watch  # watch mode
```
