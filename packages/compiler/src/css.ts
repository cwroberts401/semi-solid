/**
 * css.ts
 *
 * Phase 7: CSS handling for Shopify theme builds.
 *
 * Resolves brand-specific and global CSS entry points, and generates
 * the Liquid asset include tags needed in layout/theme.liquid.
 *
 * Shopify theme CSS lives in assets/ and is referenced via a direct <link> tag
 * (not stylesheet_tag, which defers loading and causes FOUC):
 *   <link rel="stylesheet" href="{{ 'theme.css' | asset_url }}" media="all">
 *
 * JS assets use the modern module pattern (script_tag is deprecated):
 *   <script src="{{ 'theme.entry.js' | asset_url }}" type="module"></script>
 */

import fs from 'node:fs';
import path from 'node:path';
import type { TapMapping } from './tap-extract.js';

export interface CSSFile {
  /** Absolute path to the CSS source file. */
  src: string;
  /** Filename the file will have inside the Shopify theme's assets/ directory. */
  assetName: string;
}

/**
 * Resolves CSS files for a brand build.
 *
 * Looks for (in precedence order):
 *   1. src/brands/{brand}/theme.css     → assets/theme.css  (brand-specific styles)
 *   2. src/styles/global.css            → assets/global.css (shared global CSS)
 *   3. src/index.css                    → assets/index.css  (Tailwind entry, if present)
 *
 * All files that exist are returned — multiple CSS files are allowed.
 */
export function resolveCSSFiles(
  brand: string,
  projectRoot: string,
  existsSync: (p: string) => boolean = fs.existsSync,
): CSSFile[] {
  const candidates: Array<{ rel: string; assetName: string }> = [
    {
      rel: path.join('src', 'brands', brand, 'theme.css'),
      assetName: 'theme.css',
    },
    {
      rel: path.join('src', 'styles', 'global.css'),
      assetName: 'global.css',
    },
    {
      rel: path.join('src', 'index.css'),
      assetName: 'index.css',
    },
  ];

  return candidates
    .map(({ rel, assetName }) => ({
      src: path.join(projectRoot, rel),
      assetName,
    }))
    .filter(({ src }) => existsSync(src));
}

/**
 * Generates a render-blocking CSS include for a Shopify theme asset.
 *
 * Uses a direct <link> tag instead of the `| stylesheet_tag` Liquid filter.
 * Shopify's stylesheet_tag defers loading with media="print" + onload swap,
 * which causes a flash of unstyled content (FOUC) and layout shift.
 * A plain <link rel="stylesheet"> is render-blocking by default, ensuring
 * styles are applied before the first paint.
 *
 * Output: <link rel="stylesheet" href="{{ 'theme.css' | asset_url }}" media="all">
 */
export function generateStylesheetTag(assetName: string): string {
  return `<link rel="stylesheet" href="{{ '${assetName}' | asset_url }}" media="all">`;
}

/**
 * Generates a modern Shopify Liquid script include for a JS asset.
 * Uses type="module" for ES modules. The deprecated `script_tag` filter
 * is avoided — Shopify's own guidance recommends explicit <script> tags.
 *
 * Output: <script src="{{ 'theme.entry.js' | asset_url }}" type="module"></script>
 */
export function generateScriptTag(assetName: string): string {
  return `<script src="{{ '${assetName}' | asset_url }}" type="module"></script>`;
}

// ---------------------------------------------------------------------------
// Personalization: preconnect + prefetch
// ---------------------------------------------------------------------------

export interface PersonalizationAssetOptions {
  baseUrl: string;
  preconnect: boolean;
  prefetch: boolean;
  calls: Array<{
    url: string;
    params: Record<string, string>;
    componentMappings: TapMapping;
  }>;
}

/**
 * Generates a `<link rel="preconnect">` tag for an external API origin.
 * Extracts the origin (scheme + host) from the full URL.
 */
export function generatePreconnectTag(baseUrl: string): string {
  try {
    const origin = new URL(baseUrl).origin;
    return `<link rel="preconnect" href="${origin}" crossorigin>`;
  } catch {
    return `<link rel="preconnect" href="${baseUrl}" crossorigin>`;
  }
}

/**
 * Generates an inline `<script>` that prefetches personalized data.
 *
 * For each call, builds a Liquid-powered URL with `| url_encode` on each
 * param value, wraps in an IIFE that stores the fetch promise on
 * `window.__p[url]`.
 *
 * Param keys are sorted alphabetically to match the runtime's `buildUrl()`.
 */
export function generatePrefetchScript(
  calls: PersonalizationAssetOptions['calls'],
  baseUrl: string,
): string {
  if (calls.length === 0) return '';

  const iifes: string[] = [];

  for (const call of calls) {
    // Build the full URL
    let fullUrl: string;
    if (/^https?:\/\//.test(call.url)) {
      fullUrl = call.url;
    } else {
      fullUrl = baseUrl.replace(/\/$/, '') + '/' + call.url.replace(/^\//, '');
    }

    // Build query string with Liquid url_encode on each param
    const sortedKeys = Object.keys(call.params).sort();
    if (sortedKeys.length > 0) {
      const qs = sortedKeys.map((key) => {
        const tapVarName = call.params[key];
        const liquidExpr = call.componentMappings[tapVarName];
        if (!liquidExpr) {
          // Param not mapped to a tap variable — use empty string
          return `${encodeURIComponent(key)}=`;
        }
        // Strip {{ }} from the liquid expression
        const bare = liquidExpr.replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '');
        return `${encodeURIComponent(key)}={{ ${bare} | url_encode }}`;
      }).join('&');
      fullUrl += `?${qs}`;
    }

    iifes.push([
      `(function() {`,
      `  var u = "${fullUrl}";`,
      `  window.__p[u] = fetch(u).then(function(r) { return r.json(); });`,
      `})();`,
    ].join('\n'));
  }

  return [
    '<script>',
    'window.__p = window.__p || {};',
    ...iifes,
    '</script>',
  ].join('\n');
}

/**
 * Generates a block of Liquid asset includes (CSS stylesheets + JS modules)
 * suitable for insertion in the <head> of layout/theme.liquid.
 *
 * Ordering: preconnect → CSS → JS → prefetch script.
 * Backward compatible — omitting personalization produces the same output.
 */
export function generateAssetIncludes(
  cssAssets: string[],
  jsAssets: string[],
  personalization?: PersonalizationAssetOptions,
): string {
  const lines: string[] = [];

  // Preconnect first (highest priority for early connection)
  if (personalization?.preconnect && personalization.baseUrl) {
    lines.push(generatePreconnectTag(personalization.baseUrl));
  }

  // CSS stylesheets
  lines.push(...cssAssets.map(generateStylesheetTag));

  // JS modules
  lines.push(...jsAssets.map(generateScriptTag));

  // Prefetch script last (needs DOM to be parsing already)
  if (personalization?.prefetch && personalization.calls.length > 0) {
    lines.push(generatePrefetchScript(personalization.calls, personalization.baseUrl));
  }

  return lines.join('\n');
}
