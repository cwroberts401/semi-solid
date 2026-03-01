/**
 * i18n.test.ts
 *
 * Tests for Phase 5: locale file resolution and virtual module.
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {
  resolveLocaleFiles,
  resolveActiveLocalePath,
  VIRTUAL_LOCALE_MODULE,
  virtualLocaleIds,
} from '../src/i18n';
import { t, setTranslations } from '../../runtime/src/t';

const ROOT = '/project';
const OUT = '/dist/brand-a/en';

// ---------------------------------------------------------------------------
// resolveLocaleFiles()
// ---------------------------------------------------------------------------

describe('resolveLocaleFiles()', () => {
  describe('when i18n directory does not exist', () => {
    it('returns an empty array', () => {
      const result = resolveLocaleFiles('brand-a', 'en', ROOT, OUT, () => false, () => []);
      expect(result).toEqual([]);
    });
  });

  describe('active locale naming', () => {
    it('writes the active locale as {locale}.default.json', () => {
      const pairs = resolveLocaleFiles(
        'brand-a', 'en', ROOT, OUT,
        () => true,
        () => ['en.json', 'fr.json'],
      );
      const en = pairs.find((p) => p.dest.endsWith('en.default.json'));
      expect(en).toBeDefined();
      expect(en!.src).toContain('en.json');
    });

    it('writes the active French locale as fr.default.json', () => {
      const pairs = resolveLocaleFiles(
        'brand-a', 'fr', ROOT, '/dist/brand-a/fr',
        () => true,
        () => ['en.json', 'fr.json'],
      );
      const fr = pairs.find((p) => p.dest.endsWith('fr.default.json'));
      expect(fr).toBeDefined();
    });

    it('keeps non-active locales without the .default suffix', () => {
      const pairs = resolveLocaleFiles(
        'brand-a', 'en', ROOT, OUT,
        () => true,
        () => ['en.json', 'fr.json'],
      );
      const fr = pairs.find((p) => p.dest.endsWith('fr.json'));
      expect(fr).toBeDefined();
      expect(fr!.dest).not.toContain('default');
    });
  });

  describe('file filtering', () => {
    it('only processes .json files', () => {
      const pairs = resolveLocaleFiles(
        'brand-a', 'en', ROOT, OUT,
        () => true,
        () => ['en.json', 'README.md', '.DS_Store', 'schema.ts'],
      );
      expect(pairs).toHaveLength(1);
      expect(pairs[0].dest).toContain('en.default.json');
    });

    it('handles an empty i18n directory', () => {
      const pairs = resolveLocaleFiles(
        'brand-a', 'en', ROOT, OUT,
        () => true,
        () => [],
      );
      expect(pairs).toEqual([]);
    });
  });

  describe('path construction', () => {
    it('constructs the correct src path', () => {
      const pairs = resolveLocaleFiles(
        'brand-a', 'en', ROOT, OUT,
        () => true,
        () => ['en.json'],
      );
      expect(pairs[0].src).toBe('/project/src/brands/brand-a/i18n/en.json');
    });

    it('places output files inside the locales/ subdirectory', () => {
      const pairs = resolveLocaleFiles(
        'brand-a', 'en', ROOT, OUT,
        () => true,
        () => ['en.json'],
      );
      expect(pairs[0].dest).toBe('/dist/brand-a/en/locales/en.default.json');
    });

    it('scopes output to the correct brand and locale outDir', () => {
      const out = '/dist/brand-b/de';
      const pairs = resolveLocaleFiles(
        'brand-b', 'de', ROOT, out,
        () => true,
        () => ['en.json', 'de.json'],
      );
      const de = pairs.find((p) => p.dest.endsWith('de.default.json'));
      expect(de!.dest).toContain('/dist/brand-b/de/locales/');
    });
  });

  describe('multi-locale brands', () => {
    it('returns a pair for each locale file', () => {
      const pairs = resolveLocaleFiles(
        'brand-a', 'en', ROOT, OUT,
        () => true,
        () => ['en.json', 'fr.json'],
      );
      expect(pairs).toHaveLength(2);
    });

    it('returns four pairs for a brand with four locales', () => {
      const pairs = resolveLocaleFiles(
        'brand-a', 'en', ROOT, OUT,
        () => true,
        () => ['en.json', 'fr.json', 'de.json', 'es.json'],
      );
      expect(pairs).toHaveLength(4);
      const defaultFile = pairs.filter((p) => p.dest.includes('.default.'));
      expect(defaultFile).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
// resolveActiveLocalePath()
// ---------------------------------------------------------------------------

describe('resolveActiveLocalePath()', () => {
  it('returns the path when the locale file exists', () => {
    const mock = (p: string) => p.endsWith('en.json');
    const result = resolveActiveLocalePath('brand-a', 'en', ROOT, mock);
    expect(result).toBe('/project/src/brands/brand-a/i18n/en.json');
  });

  it('returns null when the locale file does not exist', () => {
    const result = resolveActiveLocalePath('brand-a', 'en', ROOT, () => false);
    expect(result).toBeNull();
  });

  it('constructs the path from brand and locale', () => {
    const seen: string[] = [];
    const mock = (p: string) => { seen.push(p); return false; };
    resolveActiveLocalePath('brand-b', 'de', ROOT, mock);
    expect(seen[0]).toContain(path.join('brand-b', 'i18n', 'de.json'));
  });
});

// ---------------------------------------------------------------------------
// Virtual module ids
// ---------------------------------------------------------------------------

describe('virtual module ids', () => {
  it('has the expected external id', () => {
    expect(VIRTUAL_LOCALE_MODULE).toBe('virtual:semi-solid/locale');
  });

  it('has an internal id prefixed with \\0', () => {
    expect(virtualLocaleIds.internal).toMatch(/^\0/);
    expect(virtualLocaleIds.internal).toContain('virtual:semi-solid/locale');
  });

  it('external and internal ids are different', () => {
    expect(virtualLocaleIds.external).not.toBe(virtualLocaleIds.internal);
  });
});

// ---------------------------------------------------------------------------
// Integration: real locale files for Phase 5 milestone
// ---------------------------------------------------------------------------

describe('Phase 5 milestone: real locale files', () => {
  const projectRoot = path.resolve(__dirname, '../../../');

  it('brand-a has an en.json locale file', () => {
    const result = resolveActiveLocalePath('brand-a', 'en', projectRoot);
    expect(result).not.toBeNull();
    expect(result).toContain('brand-a');
  });

  it('brand-a has a fr.json locale file', () => {
    const result = resolveActiveLocalePath('brand-a', 'fr', projectRoot);
    expect(result).not.toBeNull();
  });

  it('brand-b has an en.json locale file', () => {
    const result = resolveActiveLocalePath('brand-b', 'en', projectRoot);
    expect(result).not.toBeNull();
    expect(result).toContain('brand-b');
  });

  it('brand-a en.json has the expected translation keys', () => {
    const localePath = resolveActiveLocalePath('brand-a', 'en', projectRoot)!;
    const data = JSON.parse(fs.readFileSync(localePath, 'utf-8'));

    expect(data.product?.add_to_cart).toBe('Add to Cart');
    expect(data.product?.sold_out).toBe('Sold Out');
    expect(data.cart?.title).toBe('Your Cart');
  });

  it('brand-a fr.json has French translations', () => {
    const localePath = resolveActiveLocalePath('brand-a', 'fr', projectRoot)!;
    const data = JSON.parse(fs.readFileSync(localePath, 'utf-8'));

    expect(data.product?.add_to_cart).toBe('Ajouter au panier');
    expect(data.product?.sold_out).toBe('Épuisé');
  });

  it('brand-b en.json has different copy than brand-a en.json', () => {
    const aPath = resolveActiveLocalePath('brand-a', 'en', projectRoot)!;
    const bPath = resolveActiveLocalePath('brand-b', 'en', projectRoot)!;

    const brandA = JSON.parse(fs.readFileSync(aPath, 'utf-8'));
    const brandB = JSON.parse(fs.readFileSync(bPath, 'utf-8'));

    // brand-b says "Add to Bag" not "Add to Cart"
    expect(brandA.product.add_to_cart).not.toBe(brandB.product.add_to_cart);
  });

  it('brand-a resolveLocaleFiles returns en+fr pairs', () => {
    const outDir = path.join(projectRoot, 'dist', 'brand-a', 'en');
    const pairs = resolveLocaleFiles('brand-a', 'en', projectRoot, outDir);

    expect(pairs.length).toBeGreaterThanOrEqual(2);
    const defaultPair = pairs.find((p) => p.dest.endsWith('en.default.json'));
    const frPair = pairs.find((p) => p.dest.endsWith('fr.json'));
    expect(defaultPair).toBeDefined();
    expect(frPair).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Runtime t() integration: translations load correctly from locale JSON
// ---------------------------------------------------------------------------

describe('t() with locale JSON structure', () => {
  it('resolves keys matching the brand-a en.json structure', () => {
    const projectRoot = path.resolve(__dirname, '../../../');
    const localePath = resolveActiveLocalePath('brand-a', 'en', projectRoot)!;
    const translations = JSON.parse(fs.readFileSync(localePath, 'utf-8'));

    setTranslations(translations);

    expect(t('product.add_to_cart')).toBe('Add to Cart');
    expect(t('product.sold_out')).toBe('Sold Out');
    expect(t('cart.title')).toBe('Your Cart');
    expect(t('home.shop_now')).toBe('Shop Now');
  });

  it('resolves keys matching the brand-a fr.json structure', () => {
    const projectRoot = path.resolve(__dirname, '../../../');
    const localePath = resolveActiveLocalePath('brand-a', 'fr', projectRoot)!;
    const translations = JSON.parse(fs.readFileSync(localePath, 'utf-8'));

    setTranslations(translations);

    expect(t('product.add_to_cart')).toBe('Ajouter au panier');
    expect(t('cart.checkout')).toBe('Commander');
  });
});
