# @semi-solid/solid

SolidJS runtime layer for Semi-Solid. Sits between the zero-dependency stubs in `@semi-solid/runtime` and your components, providing reactive implementations that depend on `solid-js`.

## Install

```bash
pnpm add @semi-solid/solid
```

`solid-js ^1.9.0` is a peer dependency — install it alongside this package.

## What's inside

| Export | Source | Description |
|--------|--------|-------------|
| `tap`, `tapWhen`, `tapRemote`, `tapPersonalized`, `liquidRaw`, `blockAttrs` | re-exported from `@semi-solid/runtime` | Compile-time stubs — the compiler replaces these with Liquid output and reactive signals |
| `t`, `setTranslations` | re-exported from `@semi-solid/runtime` | i18n translation helper |
| `createTapSignal`, `__setSectionId` | `tapWhen.ts` | Reactive signal that re-fetches from a Shopify data section when dependencies change |
| `__tapRemoteHtml` | `tapRemote.ts` | Fetches rendered section HTML from another route via the Section Rendering API |
| `createPersonalizedSignal`, `__setPersonalizationBaseUrl`, `buildUrl` | `tapPersonalized.ts` | Fetches personalized data from an external API with prefetch support |
| `createStore` | `store.ts` | localStorage-backed reactive store (wishlists, recently viewed, etc.) |

## Usage

Components never import from this package directly. They use the `$lib/` Vite alias, which resolves to `packages/solid/src/`:

```tsx
// src/snippets/ProductCard.tsx
import { tap } from '$lib/runtime';
import { t } from '$lib/i18n';

const title = tap('{{ product.title }}', 'Product');
```

The compiler transforms `tap()` / `tapWhen()` / `tapPersonalized()` calls at build time. The reactive implementations (`createTapSignal`, `createPersonalizedSignal`, etc.) are auto-imported by the compiler into the cleaned output — you don't call them yourself.

### createStore

`createStore` is the one export you use directly in component code:

```tsx
import { createStore } from '$lib/runtime';

const recentlyViewed = createStore<Product>('recently-viewed', { maxItems: 10 });

// Read
const items = recentlyViewed.items(); // Accessor<Product[]>

// Write
recentlyViewed.add(product);    // prepends, deduplicates, persists to localStorage
recentlyViewed.remove(product); // removes by JSON equality
recentlyViewed.clear();         // empties the store
```

## Architecture

```
@semi-solid/runtime   (zero dependencies — stubs + types)
       |
@semi-solid/solid     (solid-js — reactive implementations)
       |
  Components          (import via $lib/ alias)
       |
@semi-solid/compiler  (Vite plugin — transforms source at build time)
```

The compiler emits `$lib/runtime` and `$lib/tapWhen` imports in the transformed output. The `$lib` alias in `vite.config.ts` points to `packages/solid/src/`, so Vite resolves everything without any component files needing to know the physical path.

## Development

```bash
# Run tests
pnpm test

# Watch mode
pnpm test:watch
```
