/**
 * brand-resolve.test.ts
 *
 * Tests for brand-aware component resolution with category-based directories.
 * Uses an injectable `existsSync` so tests never hit the real filesystem.
 * A final integration section uses the real project files to validate
 * brand-a has an override; brand-b does not.
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { resolveBrandPath, resolveCategoryBrandPath, createBrandResolver } from '../src/brand-resolve';
import { extractTapMappings } from '../src/tap-extract';
import { generateLiquid } from '../src/liquid-gen';

const ROOT = '/project';

// ---------------------------------------------------------------------------
// resolveCategoryBrandPath() — category-specific resolution
// ---------------------------------------------------------------------------

describe('resolveCategoryBrandPath()', () => {
  describe('brand override takes priority', () => {
    it('returns the brand override when it exists', () => {
      const mock = (p: string) =>
        p === '/project/src/brands/brand-a/snippets/ProductCard.tsx';

      expect(resolveCategoryBrandPath('ProductCard', 'snippets', 'brand-a', ROOT, mock))
        .toBe('/project/src/brands/brand-a/snippets/ProductCard.tsx');
    });

    it('prefers override over base when both exist', () => {
      const mock = (p: string) => p.endsWith('.tsx'); // everything .tsx "exists"

      const result = resolveCategoryBrandPath('ProductCard', 'snippets', 'brand-a', ROOT, mock);
      expect(result).toContain('brand-a/snippets/ProductCard.tsx');
      expect(result).not.toContain('/src/snippets/');
    });
  });

  describe('base component fallback', () => {
    it('returns the base path when no brand override exists', () => {
      const mock = (p: string) =>
        p === '/project/src/snippets/ProductCard.tsx';

      expect(resolveCategoryBrandPath('ProductCard', 'snippets', 'brand-a', ROOT, mock))
        .toBe('/project/src/snippets/ProductCard.tsx');
    });

    it('falls back to base for a brand that has no overrides', () => {
      const mock = (p: string) => p.includes('/src/snippets/ProductCard.tsx');

      const result = resolveCategoryBrandPath('ProductCard', 'snippets', 'brand-b', ROOT, mock);
      expect(result).toContain('/src/snippets/ProductCard.tsx');
    });
  });

  describe('null when nothing found', () => {
    it('returns null when neither override nor base exists', () => {
      expect(resolveCategoryBrandPath('Unknown', 'snippets', 'brand-a', ROOT, () => false)).toBeNull();
    });

    it('returns null when only a different brand has an override', () => {
      const mock = (p: string) => p.includes('brand-c/snippets/ProductCard.tsx');
      expect(resolveCategoryBrandPath('ProductCard', 'snippets', 'brand-a', ROOT, mock)).toBeNull();
    });
  });

  describe('extension resolution', () => {
    it('prefers .tsx over .ts over .jsx over .js', () => {
      // Only .ts (not .tsx) exists
      const mock = (p: string) => p.endsWith('.ts') && !p.endsWith('.tsx');
      const result = resolveCategoryBrandPath('MyUtil', 'snippets', 'brand-a', ROOT, mock);
      expect(result).toMatch(/\.ts$/);
      expect(result).not.toMatch(/\.tsx$/);
    });

    it('finds .jsx if no .tsx or .ts', () => {
      const mock = (p: string) => p.endsWith('.jsx');
      const result = resolveCategoryBrandPath('LegacyComp', 'snippets', 'brand-a', ROOT, mock);
      expect(result).toMatch(/\.jsx$/);
    });

    it('strips an existing extension before probing', () => {
      const mock = (p: string) =>
        p === '/project/src/brands/brand-a/snippets/ProductCard.tsx';

      // Caller passes 'ProductCard.tsx' with extension already present
      const result = resolveCategoryBrandPath('ProductCard.tsx', 'snippets', 'brand-a', ROOT, mock);
      expect(result).toBe('/project/src/brands/brand-a/snippets/ProductCard.tsx');
    });
  });

  describe('path construction', () => {
    it('constructs the correct override directory path', () => {
      const seen: string[] = [];
      const mock = (p: string) => { seen.push(p); return false; };

      resolveCategoryBrandPath('Header', 'snippets', 'brand-a', ROOT, mock);

      // Should have checked brand-a override paths first
      expect(seen[0]).toContain(path.join('brands', 'brand-a', 'snippets', 'Header'));
    });

    it('constructs the correct base directory path', () => {
      const seen: string[] = [];
      const mock = (p: string) => { seen.push(p); return false; };

      resolveCategoryBrandPath('Footer', 'snippets', 'brand-a', ROOT, mock);

      // After overrides, should check base paths
      const baseChecks = seen.filter(p => p.includes('/src/snippets/'));
      expect(baseChecks.length).toBeGreaterThan(0);
      expect(baseChecks[0]).toContain(path.join('src', 'snippets', 'Footer'));
    });

    it('handles nested component paths', () => {
      const mock = (p: string) =>
        p === '/project/src/snippets/forms/AddressForm.tsx';

      const result = resolveCategoryBrandPath('forms/AddressForm', 'snippets', 'brand-a', ROOT, mock);
      expect(result).toBe('/project/src/snippets/forms/AddressForm.tsx');
    });
  });

  describe('different categories', () => {
    it('resolves from sections category', () => {
      const mock = (p: string) =>
        p === '/project/src/sections/ProductSection.tsx';

      const result = resolveCategoryBrandPath('ProductSection', 'sections', 'brand-a', ROOT, mock);
      expect(result).toBe('/project/src/sections/ProductSection.tsx');
    });

    it('resolves from blocks category', () => {
      const mock = (p: string) =>
        p === '/project/src/blocks/ImageGallery.tsx';

      const result = resolveCategoryBrandPath('ImageGallery', 'blocks', 'brand-a', ROOT, mock);
      expect(result).toBe('/project/src/blocks/ImageGallery.tsx');
    });

    it('resolves brand override in sections category', () => {
      const mock = (p: string) =>
        p === '/project/src/brands/brand-a/sections/ProductSection.tsx';

      const result = resolveCategoryBrandPath('ProductSection', 'sections', 'brand-a', ROOT, mock);
      expect(result).toBe('/project/src/brands/brand-a/sections/ProductSection.tsx');
    });
  });

  describe('multi-brand isolation', () => {
    it('resolves differently per brand', () => {
      // brand-a has override, brand-b does not
      const mock = (p: string) =>
        p === '/project/src/brands/brand-a/snippets/ProductCard.tsx' ||
        p === '/project/src/snippets/ProductCard.tsx';

      const brandA = resolveCategoryBrandPath('ProductCard', 'snippets', 'brand-a', ROOT, mock);
      const brandB = resolveCategoryBrandPath('ProductCard', 'snippets', 'brand-b', ROOT, mock);

      expect(brandA).toContain('brand-a/snippets/ProductCard.tsx');
      expect(brandB).toContain('/src/snippets/ProductCard.tsx');
    });
  });
});

// ---------------------------------------------------------------------------
// resolveBrandPath() — cross-category resolution
// ---------------------------------------------------------------------------

describe('resolveBrandPath()', () => {
  it('finds a component in snippets', () => {
    const mock = (p: string) =>
      p === '/project/src/snippets/ProductCard.tsx';

    expect(resolveBrandPath('ProductCard', 'brand-a', ROOT, mock))
      .toBe('/project/src/snippets/ProductCard.tsx');
  });

  it('finds a component in sections', () => {
    const mock = (p: string) =>
      p === '/project/src/sections/ProductSection.tsx';

    expect(resolveBrandPath('ProductSection', 'brand-a', ROOT, mock))
      .toBe('/project/src/sections/ProductSection.tsx');
  });

  it('finds a component in blocks', () => {
    const mock = (p: string) =>
      p === '/project/src/blocks/ImageGallery.tsx';

    expect(resolveBrandPath('ImageGallery', 'brand-a', ROOT, mock))
      .toBe('/project/src/blocks/ImageGallery.tsx');
  });

  it('prefers brand override across categories', () => {
    const mock = (p: string) =>
      p === '/project/src/brands/brand-a/snippets/ProductCard.tsx' ||
      p === '/project/src/snippets/ProductCard.tsx';

    expect(resolveBrandPath('ProductCard', 'brand-a', ROOT, mock))
      .toContain('brand-a/snippets/ProductCard.tsx');
  });

  it('returns null when nothing found', () => {
    expect(resolveBrandPath('Unknown', 'brand-a', ROOT, () => false)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createBrandResolver() — Vite plugin interface
// ---------------------------------------------------------------------------

describe('createBrandResolver() plugin', () => {
  it('returns null for non-category imports', () => {
    const plugin = createBrandResolver('brand-a', ROOT);
    const resolveId = plugin.resolveId as (source: string) => string | null;

    expect(resolveId('solid-js')).toBeNull();
    expect(resolveId('./ProductCard')).toBeNull();
    expect(resolveId('../base/ProductCard')).toBeNull();
    expect(resolveId('$lib/runtime')).toBeNull();
    expect(resolveId('$brand/theme')).toBeNull();
  });

  it('resolves $snippets/ paths using brand resolution', () => {
    const projectRoot = path.resolve(__dirname, '../../../');
    const plugin = createBrandResolver('brand-a', projectRoot);
    const resolveId = plugin.resolveId as (source: string) => string | null;

    const result = resolveId('$snippets/ProductCard');
    expect(result).not.toBeNull();
    expect(result).toMatch(/\.(tsx|ts|jsx|js)$/);
    expect(result).toContain('ProductCard');
  });

  it('resolves $sections/ paths', () => {
    const projectRoot = path.resolve(__dirname, '../../../');
    const plugin = createBrandResolver('brand-a', projectRoot);
    const resolveId = plugin.resolveId as (source: string) => string | null;

    const result = resolveId('$sections/ProductDetails');
    expect(result).not.toBeNull();
    expect(result).toContain('ProductDetails');
  });

  it('resolves $blocks/ paths', () => {
    const projectRoot = path.resolve(__dirname, '../../../');
    const plugin = createBrandResolver('brand-a', projectRoot);
    const resolveId = plugin.resolveId as (source: string) => string | null;

    const result = resolveId('$blocks/ImageGallery');
    expect(result).not.toBeNull();
    expect(result).toContain('ImageGallery');
  });

  it('returns null for category imports when component does not exist', () => {
    const plugin = createBrandResolver('brand-a', ROOT);
    const resolveId = plugin.resolveId as (source: string) => string | null;

    // ROOT is /project — no real files there
    expect(resolveId('$snippets/NonExistentComponent')).toBeNull();
    expect(resolveId('$sections/NonExistentComponent')).toBeNull();
    expect(resolveId('$blocks/NonExistentComponent')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Integration: brand-a vs brand-b resolution (real filesystem)
// ---------------------------------------------------------------------------

describe('Brand resolution with category directories (real filesystem)', () => {
  const projectRoot = path.resolve(__dirname, '../../../');

  it('brand-a gets its ProductCard override from snippets', () => {
    const plugin = createBrandResolver('brand-a', projectRoot);
    const resolveId = plugin.resolveId as (source: string) => string | null;

    const result = resolveId('$snippets/ProductCard');
    expect(result).not.toBeNull();
    // Should point to brand-a snippets override
    expect(result).toContain(path.join('brands', 'brand-a', 'snippets', 'ProductCard'));
  });

  it('brand-b falls back to base ProductCard (no override)', () => {
    const plugin = createBrandResolver('brand-b', projectRoot);
    const resolveId = plugin.resolveId as (source: string) => string | null;

    const result = resolveId('$snippets/ProductCard');
    expect(result).not.toBeNull();
    // brand-b has no ProductCard override → base snippets
    expect(result).toContain(path.join('src', 'snippets', 'ProductCard'));
    expect(result).not.toContain('brand-b');
  });

  it('brand-a falls back to base for ImageGallery (no override)', () => {
    const plugin = createBrandResolver('brand-a', projectRoot);
    const resolveId = plugin.resolveId as (source: string) => string | null;

    const result = resolveId('$blocks/ImageGallery');
    expect(result).not.toBeNull();
    expect(result).toContain(path.join('src', 'blocks', 'ImageGallery'));
  });

  it('brand-a override generates different liquid than brand-b base', () => {
    const overridePath = path.join(
      projectRoot, 'src', 'brands', 'brand-a', 'snippets', 'ProductCard.tsx',
    );
    const basePath = path.join(
      projectRoot, 'src', 'snippets', 'ProductCard.tsx',
    );

    const overrideSource = fs.readFileSync(overridePath, 'utf-8');
    const baseSource = fs.readFileSync(basePath, 'utf-8');

    const { mappings: overrideMappings } = extractTapMappings(overrideSource, 'ProductCard.tsx');
    const { mappings: baseMappings } = extractTapMappings(baseSource, 'ProductCard.tsx');

    const overrideLiquid = generateLiquid(overrideSource, overrideMappings, { componentName: 'ProductCard' });
    const baseLiquid = generateLiquid(baseSource, baseMappings, { componentName: 'ProductCard' });

    // brand-a override has the sale badge; base does not
    expect(overrideLiquid).toContain('product.compare_at_price > product.price');
    expect(baseLiquid).not.toContain('product.compare_at_price > product.price');

    // brand-a has the brand-specific class
    expect(overrideLiquid).toContain('product-card--brand-a');
    expect(baseLiquid).not.toContain('product-card--brand-a');
  });
});
