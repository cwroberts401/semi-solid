/**
 * css.test.ts
 *
 * Tests for Phase 7: CSS file resolution and Liquid asset tag generation.
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  resolveCSSFiles,
  generateStylesheetTag,
  generateScriptTag,
  generateAssetIncludes,
  generatePreconnectTag,
  generatePrefetchScript,
} from '../src/css';

const ROOT = '/project';

// ---------------------------------------------------------------------------
// generateStylesheetTag()
// ---------------------------------------------------------------------------

describe('generateStylesheetTag()', () => {
  it('produces a Shopify stylesheet_tag liquid expression', () => {
    expect(generateStylesheetTag('theme.css')).toBe(
      "{{ 'theme.css' | asset_url | stylesheet_tag }}",
    );
  });

  it('uses the provided asset name verbatim', () => {
    expect(generateStylesheetTag('global-abc12345.css')).toBe(
      "{{ 'global-abc12345.css' | asset_url | stylesheet_tag }}",
    );
  });

  it('wraps the name in single quotes inside the liquid expression', () => {
    const tag = generateStylesheetTag('theme.css');
    expect(tag).toContain("'theme.css'");
  });
});

// ---------------------------------------------------------------------------
// generateScriptTag()
// ---------------------------------------------------------------------------

describe('generateScriptTag()', () => {
  it('produces a modern module script tag', () => {
    expect(generateScriptTag('theme.entry.js')).toBe(
      `<script src="{{ 'theme.entry.js' | asset_url }}" type="module"></script>`,
    );
  });

  it('includes type="module" for ES module semantics', () => {
    expect(generateScriptTag('theme.entry.js')).toContain('type="module"');
  });

  it('uses asset_url filter to get the CDN URL', () => {
    expect(generateScriptTag('theme.entry.js')).toContain('asset_url');
  });

  it('uses the provided asset name verbatim', () => {
    expect(generateScriptTag('bundle-abc12345.js')).toContain("'bundle-abc12345.js'");
  });
});

// ---------------------------------------------------------------------------
// generateAssetIncludes()
// ---------------------------------------------------------------------------

describe('generateAssetIncludes()', () => {
  it('returns an empty string for no assets', () => {
    expect(generateAssetIncludes([], [])).toBe('');
  });

  it('generates stylesheet tags for CSS files', () => {
    const result = generateAssetIncludes(['theme.css'], []);
    expect(result).toContain('stylesheet_tag');
    expect(result).toContain('theme.css');
  });

  it('generates script tags for JS files', () => {
    const result = generateAssetIncludes([], ['theme.entry.js']);
    expect(result).toContain('type="module"');
    expect(result).toContain('theme.entry.js');
  });

  it('lists CSS before JS', () => {
    const result = generateAssetIncludes(['theme.css'], ['theme.entry.js']);
    const cssPos = result.indexOf('stylesheet_tag');
    const jsPos = result.indexOf('theme.entry.js');
    expect(cssPos).toBeLessThan(jsPos);
  });

  it('handles multiple CSS files', () => {
    const result = generateAssetIncludes(['index.css', 'theme.css'], []);
    expect(result).toContain('index.css');
    expect(result).toContain('theme.css');
  });

  it('separates entries with newlines', () => {
    const result = generateAssetIncludes(['theme.css'], ['theme.entry.js']);
    expect(result.split('\n').length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// generatePreconnectTag()
// ---------------------------------------------------------------------------

describe('generatePreconnectTag()', () => {
  it('extracts origin and strips path', () => {
    const tag = generatePreconnectTag('https://api.myapp.com/v1/data');
    expect(tag).toBe('<link rel="preconnect" href="https://api.myapp.com" crossorigin>');
  });

  it('handles a URL with just an origin', () => {
    const tag = generatePreconnectTag('https://cdn.example.com');
    expect(tag).toBe('<link rel="preconnect" href="https://cdn.example.com" crossorigin>');
  });

  it('preserves the port in the origin', () => {
    const tag = generatePreconnectTag('https://api.myapp.com:8443/path');
    expect(tag).toBe('<link rel="preconnect" href="https://api.myapp.com:8443" crossorigin>');
  });

  it('falls back to raw URL for invalid input', () => {
    const tag = generatePreconnectTag('not-a-url');
    expect(tag).toContain('not-a-url');
    expect(tag).toContain('crossorigin');
  });
});

// ---------------------------------------------------------------------------
// generatePrefetchScript()
// ---------------------------------------------------------------------------

describe('generatePrefetchScript()', () => {
  it('generates Liquid url_encode for params', () => {
    const result = generatePrefetchScript(
      [{
        url: '/api/recs',
        params: { customerId: 'customerId' },
        componentMappings: { customerId: '{{ customer.id }}' },
      }],
      'https://api.myapp.com',
    );
    expect(result).toContain('window.__p');
    expect(result).toContain('{{ customer.id | url_encode }}');
    expect(result).toContain('https://api.myapp.com/api/recs');
  });

  it('respects baseUrl for relative URLs', () => {
    const result = generatePrefetchScript(
      [{
        url: '/api/recs',
        params: {},
        componentMappings: {},
      }],
      'https://api.myapp.com',
    );
    expect(result).toContain('https://api.myapp.com/api/recs');
  });

  it('handles absolute URLs in calls', () => {
    const result = generatePrefetchScript(
      [{
        url: 'https://other.com/api/recs',
        params: { id: 'customerId' },
        componentMappings: { customerId: '{{ customer.id }}' },
      }],
      'https://api.myapp.com',
    );
    expect(result).toContain('https://other.com/api/recs');
    expect(result).not.toContain('api.myapp.com');
  });

  it('sorts param keys alphabetically', () => {
    const result = generatePrefetchScript(
      [{
        url: '/api/recs',
        params: { zebra: 'z', alpha: 'a' },
        componentMappings: { z: '{{ z }}', a: '{{ a }}' },
      }],
      'https://api.myapp.com',
    );
    const alphaIdx = result.indexOf('alpha=');
    const zebraIdx = result.indexOf('zebra=');
    expect(alphaIdx).toBeLessThan(zebraIdx);
  });

  it('returns empty string for empty calls array', () => {
    expect(generatePrefetchScript([], 'https://api.myapp.com')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// generateAssetIncludes() — personalization
// ---------------------------------------------------------------------------

describe('generateAssetIncludes() with personalization', () => {
  it('places preconnect before CSS', () => {
    const result = generateAssetIncludes(['theme.css'], ['theme.entry.js'], {
      baseUrl: 'https://api.myapp.com',
      preconnect: true,
      prefetch: false,
      calls: [],
    });
    const preconnectPos = result.indexOf('preconnect');
    const cssPos = result.indexOf('stylesheet_tag');
    expect(preconnectPos).toBeLessThan(cssPos);
  });

  it('is backward compatible without personalization param', () => {
    const withoutParam = generateAssetIncludes(['theme.css'], ['theme.entry.js']);
    expect(withoutParam).toContain('stylesheet_tag');
    expect(withoutParam).toContain('theme.entry.js');
    expect(withoutParam).not.toContain('preconnect');
  });

  it('includes prefetch script after JS', () => {
    const result = generateAssetIncludes([], ['theme.entry.js'], {
      baseUrl: 'https://api.myapp.com',
      preconnect: false,
      prefetch: true,
      calls: [{
        url: '/api/recs',
        params: { id: 'customerId' },
        componentMappings: { customerId: '{{ customer.id }}' },
      }],
    });
    const jsPos = result.indexOf('theme.entry.js');
    const prefetchPos = result.indexOf('window.__p');
    expect(jsPos).toBeLessThan(prefetchPos);
  });

  it('omits prefetch script when prefetch is false', () => {
    const result = generateAssetIncludes([], [], {
      baseUrl: 'https://api.myapp.com',
      preconnect: true,
      prefetch: false,
      calls: [{
        url: '/api/recs',
        params: {},
        componentMappings: {},
      }],
    });
    expect(result).not.toContain('window.__p');
  });
});

// ---------------------------------------------------------------------------
// resolveCSSFiles()
// ---------------------------------------------------------------------------

describe('resolveCSSFiles()', () => {
  it('returns brand theme.css when it exists', () => {
    const brandCssPath = path.join(ROOT, 'src', 'brands', 'brand-a', 'theme.css');
    const existsSync = (p: string) => p === brandCssPath;

    const files = resolveCSSFiles('brand-a', ROOT, existsSync);
    expect(files).toHaveLength(1);
    expect(files[0].src).toBe(brandCssPath);
    expect(files[0].assetName).toBe('theme.css');
  });

  it('returns src/index.css when it exists and brand CSS does not', () => {
    const indexCssPath = path.join(ROOT, 'src', 'index.css');
    const existsSync = (p: string) => p === indexCssPath;

    const files = resolveCSSFiles('brand-a', ROOT, existsSync);
    expect(files).toHaveLength(1);
    expect(files[0].src).toBe(indexCssPath);
    expect(files[0].assetName).toBe('index.css');
  });

  it('returns both brand CSS and global CSS when both exist', () => {
    const brandCssPath = path.join(ROOT, 'src', 'brands', 'brand-a', 'theme.css');
    const globalCssPath = path.join(ROOT, 'src', 'styles', 'global.css');
    const existsSync = (p: string) => p === brandCssPath || p === globalCssPath;

    const files = resolveCSSFiles('brand-a', ROOT, existsSync);
    expect(files).toHaveLength(2);
    expect(files.map((f) => f.assetName)).toContain('theme.css');
    expect(files.map((f) => f.assetName)).toContain('global.css');
  });

  it('returns empty array when no CSS files exist', () => {
    const files = resolveCSSFiles('brand-a', ROOT, () => false);
    expect(files).toEqual([]);
  });

  it('resolves correct brand-b path', () => {
    const brandBPath = path.join(ROOT, 'src', 'brands', 'brand-b', 'theme.css');
    const existsSync = (p: string) => p === brandBPath;

    const files = resolveCSSFiles('brand-b', ROOT, existsSync);
    expect(files[0].src).toContain('brand-b');
  });
});

// ---------------------------------------------------------------------------
// Integration: real CSS files exist for Phase 7 milestone
// ---------------------------------------------------------------------------

describe('Phase 7 milestone: real CSS files', () => {
  const projectRoot = path.resolve(__dirname, '../../../');

  it('brand-a has a theme.css', () => {
    const files = resolveCSSFiles('brand-a', projectRoot);
    const brandFile = files.find((f) => f.assetName === 'theme.css');
    expect(brandFile).toBeDefined();
    expect(brandFile!.src).toContain('brand-a');
  });

  it('brand-b has a theme.css', () => {
    const files = resolveCSSFiles('brand-b', projectRoot);
    const brandFile = files.find((f) => f.assetName === 'theme.css');
    expect(brandFile).toBeDefined();
    expect(brandFile!.src).toContain('brand-b');
  });

  it('global index.css is also resolved', () => {
    const files = resolveCSSFiles('brand-a', projectRoot);
    const globalFile = files.find((f) => f.assetName === 'index.css');
    expect(globalFile).toBeDefined();
  });

  it('brand-a and brand-b have different theme.css paths', () => {
    const aFiles = resolveCSSFiles('brand-a', projectRoot);
    const bFiles = resolveCSSFiles('brand-b', projectRoot);
    const aTheme = aFiles.find((f) => f.assetName === 'theme.css')!;
    const bTheme = bFiles.find((f) => f.assetName === 'theme.css')!;
    expect(aTheme.src).not.toBe(bTheme.src);
  });
});
