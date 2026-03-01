/**
 * validation.test.ts
 *
 * Tests for Phase 7: build validation and manifest generation.
 */

import { describe, it, expect } from 'vitest';
import {
  extractLiquidObjects,
  validateTapMappings,
  validateUnusedMappings,
  generateManifest,
  GLOBAL_LIQUID_OBJECTS,
} from '../src/validation';
import type { TapMapping } from '../src/tap-extract';

// ---------------------------------------------------------------------------
// extractLiquidObjects()
// ---------------------------------------------------------------------------

describe('extractLiquidObjects()', () => {
  it('extracts the root object from a simple member expression', () => {
    expect(extractLiquidObjects('{{ product.title }}')).toEqual(['product']);
  });

  it('extracts the root object when filters are present', () => {
    expect(extractLiquidObjects('{{ product.price | money }}')).toEqual(['product']);
  });

  it('extracts the root object from a multi-filter expression', () => {
    expect(
      extractLiquidObjects("{{ product.featured_image | img_url: '600x' }}"),
    ).toEqual(['product']);
  });

  it('extracts the root object from a cart expression', () => {
    expect(extractLiquidObjects('{{ cart.item_count }}')).toEqual(['cart']);
  });

  it('extracts the root object from a shop expression', () => {
    expect(extractLiquidObjects('{{ shop.name }}')).toEqual(['shop']);
  });

  it('returns [] for a string literal (translation key)', () => {
    expect(extractLiquidObjects("{{ 'product.add_to_cart' | t }}")).toEqual([]);
  });

  it('returns [] for a double-quoted string literal', () => {
    expect(extractLiquidObjects('{{ "cart.title" | t }}')).toEqual([]);
  });

  it('handles a bare object reference without braces', () => {
    expect(extractLiquidObjects('product')).toEqual(['product']);
  });

  it('handles a bare dotted path without braces', () => {
    expect(extractLiquidObjects('product.handle')).toEqual(['product']);
  });

  it('returns [] for an empty string', () => {
    expect(extractLiquidObjects('')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// GLOBAL_LIQUID_OBJECTS
// ---------------------------------------------------------------------------

describe('GLOBAL_LIQUID_OBJECTS', () => {
  it('includes shop', () => {
    expect(GLOBAL_LIQUID_OBJECTS.has('shop')).toBe(true);
  });

  it('includes settings', () => {
    expect(GLOBAL_LIQUID_OBJECTS.has('settings')).toBe(true);
  });

  it('includes request', () => {
    expect(GLOBAL_LIQUID_OBJECTS.has('request')).toBe(true);
  });

  it('does not include product (page-specific)', () => {
    expect(GLOBAL_LIQUID_OBJECTS.has('product')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateTapMappings()
// ---------------------------------------------------------------------------

describe('validateTapMappings()', () => {
  it('returns no warnings when all objects are in the route context', () => {
    const mappings: TapMapping = {
      title: '{{ product.title }}',
      price: '{{ product.price | money }}',
    };
    const warnings = validateTapMappings(mappings, ['product', 'collection']);
    expect(warnings).toHaveLength(0);
  });

  it('returns a warning when an object is not in the route context', () => {
    const mappings: TapMapping = {
      title: '{{ product.title }}',
    };
    // Index route only has 'shop' in context
    const warnings = validateTapMappings(mappings, ['shop']);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe('context_mismatch');
    expect(warnings[0].variable).toBe('title');
    expect(warnings[0].liquidExpr).toBe('{{ product.title }}');
    expect(warnings[0].message).toContain('product');
  });

  it('does not warn for global objects even if not in route context', () => {
    const mappings: TapMapping = {
      shopName: '{{ shop.name }}',
    };
    // Cart route has 'cart' in context, not 'shop' — but shop is global
    const warnings = validateTapMappings(mappings, ['cart']);
    expect(warnings).toHaveLength(0);
  });

  it('does not warn for settings (globally available)', () => {
    const mappings: TapMapping = {
      primaryColor: '{{ settings.color_primary }}',
    };
    const warnings = validateTapMappings(mappings, ['product']);
    expect(warnings).toHaveLength(0);
  });

  it('returns one warning per mismatched variable', () => {
    const mappings: TapMapping = {
      title: '{{ product.title }}',
      articleTitle: '{{ article.title }}',
    };
    const warnings = validateTapMappings(mappings, ['collection']);
    expect(warnings).toHaveLength(2);
  });

  it('returns no warnings for translation calls (string literal in tap)', () => {
    const mappings: TapMapping = {
      addToCart: "{{ 'product.add_to_cart' | t }}",
    };
    // t() produces a string literal expression — no object to validate
    const warnings = validateTapMappings(mappings, ['shop']);
    expect(warnings).toHaveLength(0);
  });

  it('returns no warnings for an empty mappings object', () => {
    const warnings = validateTapMappings({}, ['product']);
    expect(warnings).toHaveLength(0);
  });

  it('returns no warnings when route context is empty and only globals are used', () => {
    const mappings: TapMapping = {
      name: '{{ shop.name }}',
    };
    const warnings = validateTapMappings(mappings, []);
    expect(warnings).toHaveLength(0);
  });

  it('warning message includes the available context list', () => {
    const mappings: TapMapping = {
      title: '{{ product.title }}',
    };
    const warnings = validateTapMappings(mappings, ['cart']);
    expect(warnings[0].message).toContain('cart');
  });
});

// ---------------------------------------------------------------------------
// validateUnusedMappings()
// ---------------------------------------------------------------------------

describe('validateUnusedMappings()', () => {
  it('returns no warnings when all mappings appear in the liquid output', () => {
    const mappings: TapMapping = {
      title: '{{ product.title }}',
      price: '{{ product.price | money }}',
    };
    const liquidOutput = `
      <h1>{{ product.title }}</h1>
      <span>{{ product.price | money }}</span>
    `;
    expect(validateUnusedMappings(mappings, liquidOutput)).toHaveLength(0);
  });

  it('returns a warning when a mapping base path does not appear in output', () => {
    const mappings: TapMapping = {
      comparePrice: '{{ product.compare_at_price | money }}',
    };
    const liquidOutput = `<h1>{{ product.title }}</h1>`;
    const warnings = validateUnusedMappings(mappings, liquidOutput);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe('unused_mapping');
    expect(warnings[0].variable).toBe('comparePrice');
  });

  it('counts data-props occurrences (base path still appears in liquid)', () => {
    const mappings: TapMapping = {
      handle: '{{ product.handle }}',
    };
    // handle is in data-props, not in JSX render
    const liquidOutput = `
      <div data-component="ProductCard" data-props='{ "handle": {{ product.handle | json }} }'>
        <h1>{{ product.title }}</h1>
      </div>
    `;
    // product.handle appears in data-props → no warning
    expect(validateUnusedMappings(mappings, liquidOutput)).toHaveLength(0);
  });

  it('skips __tap_inline_ synthetic variable names', () => {
    const mappings: TapMapping = {
      __tap_inline_0: '{{ product.title }}',
    };
    const liquidOutput = `<h1>hello</h1>`;
    // Inline tap calls are not tracked
    expect(validateUnusedMappings(mappings, liquidOutput)).toHaveLength(0);
  });

  it('skips translation string literals', () => {
    const mappings: TapMapping = {
      addToCart: "{{ 'product.add_to_cart' | t }}",
    };
    const liquidOutput = `<button>{{ 'product.add_to_cart' | t }}</button>`;
    expect(validateUnusedMappings(mappings, liquidOutput)).toHaveLength(0);
  });

  it('skips translation string literals even when t() not in output', () => {
    const mappings: TapMapping = {
      label: "{{ 'some.key' | t }}",
    };
    // Translation keys are string literals — no object to check
    const liquidOutput = `<div>no translations here</div>`;
    expect(validateUnusedMappings(mappings, liquidOutput)).toHaveLength(0);
  });

  it('returns no warnings for empty mappings', () => {
    expect(validateUnusedMappings({}, '<div></div>')).toHaveLength(0);
  });

  it('warning message mentions client-side usage', () => {
    const mappings: TapMapping = {
      id: '{{ product.variants.first.id }}',
    };
    const liquidOutput = `<div></div>`;
    const warnings = validateUnusedMappings(mappings, liquidOutput);
    expect(warnings[0].message).toContain('client-side');
  });
});

// ---------------------------------------------------------------------------
// generateManifest()
// ---------------------------------------------------------------------------

describe('generateManifest()', () => {
  const files = {
    templates: ['templates/product.liquid', 'templates/index.liquid'],
    snippets: ['snippets/product-card.liquid'],
    assets: ['assets/theme.entry.js'],
    locales: ['locales/en.default.json', 'locales/fr.json'],
  };

  it('includes the brand and locale', () => {
    const manifest = generateManifest('brand-a', 'en', files);
    expect(manifest.brand).toBe('brand-a');
    expect(manifest.locale).toBe('en');
  });

  it('lists all templates sorted', () => {
    const manifest = generateManifest('brand-a', 'en', files);
    expect(manifest.templates).toEqual([
      'templates/index.liquid',
      'templates/product.liquid',
    ]);
  });

  it('lists snippets', () => {
    const manifest = generateManifest('brand-a', 'en', files);
    expect(manifest.snippets).toEqual(['snippets/product-card.liquid']);
  });

  it('lists assets', () => {
    const manifest = generateManifest('brand-a', 'en', files);
    expect(manifest.assets).toEqual(['assets/theme.entry.js']);
  });

  it('lists locale files sorted', () => {
    const manifest = generateManifest('brand-a', 'en', files);
    expect(manifest.locales).toEqual(['locales/en.default.json', 'locales/fr.json']);
  });

  it('does not mutate the input arrays when sorting', () => {
    const templates = ['templates/product.liquid', 'templates/index.liquid'];
    generateManifest('brand-a', 'en', { templates, snippets: [], assets: [], locales: [] });
    // Original array order preserved
    expect(templates[0]).toBe('templates/product.liquid');
  });
});
