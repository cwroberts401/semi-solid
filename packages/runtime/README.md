# @semi-solid/runtime

Zero-dependency runtime stubs for Semi-Solid. These functions act as markers in your SolidJS component code — the compiler extracts them at build time and replaces them with Liquid template output.

## Install

```bash
pnpm add @semi-solid/runtime
```

## API

### `tap(liquidExpr, fallback)`

Maps a Liquid expression to a JavaScript value. At build time the compiler extracts the expression and emits `{{ product.title }}` (or similar) in the Liquid output. At runtime (browser, tests, Storybook) it returns the fallback.

```tsx
import { tap } from '@semi-solid/runtime';

const title = tap('{{ product.title }}', 'Default Title');
```

### `tapWhen(liquidExpr, deps, fallback)`

Reactive variant of `tap()`. The compiler replaces it with a `createTapSignal()` that re-fetches from a Shopify data section when dependencies change.

```tsx
const price = tapWhen('{{ product.selected_variant.price | money }}', [variantId], '$0.00');
```

### `tapRemote(Component, url)`

Fetches rendered HTML from another route via the Shopify Section Rendering API.

### `tapPersonalized(url, params, fallback)`

Fetches personalized data from an external API with prefetch support. The compiler replaces it with `createPersonalizedSignal()` for reactive fetching.

### `t(key, fallback)`

Translation helper. At build time the compiler emits `{{ 'key' | t }}`. At runtime it resolves against loaded locale JSON.

```tsx
import { t } from '@semi-solid/runtime';

const label = t('product.add_to_cart');
```

Use `setTranslations(translations)` to inject locale data at runtime (Storybook, tests).

### `filter(value, filterName, ...args)`

Liquid filter marker. Transforms to `{{ value | filterName: args }}` at build time.

```tsx
import { filter } from '@semi-solid/runtime';

const formatted = filter(price, 'money');
// Build output: {{ price | money }}
```

### `blockAttrs()`

Emits `{{ block.shopify_attributes }}` for Shopify Theme Editor drag-and-drop support.

```tsx
<div {...blockAttrs()}>...</div>
```

### `liquidRaw(liquidStr)`

Injects raw Liquid into the template output with no wrapping.

```tsx
liquidRaw("{% render 'theme-assets' %}");
liquidRaw("{{ content_for_header }}");
```

## Architecture

```
@semi-solid/runtime   ← you are here (zero deps — stubs + types)
       │
@semi-solid/solid     (solid-js — reactive implementations)
       │
  Components          (import via $lib/ alias)
       │
@semi-solid/compiler  (Vite plugin — transforms source at build time)
```

## Development

```bash
pnpm test        # run tests
pnpm test:watch  # watch mode
```
