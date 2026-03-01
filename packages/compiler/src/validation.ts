/**
 * validation.ts
 *
 * Phase 7: Build validation and manifest generation.
 *
 * Provides utilities to catch common mistakes at build time:
 *   - Using Liquid objects not available in the current route's context
 *   - tap() variables extracted but never rendered into the Liquid output
 *
 * Also generates a build manifest (manifest.json) summarising all emitted files.
 */

import type { TapMapping } from './tap-extract.js';

// ---------------------------------------------------------------------------
// Global Liquid objects
// ---------------------------------------------------------------------------

/**
 * Shopify Liquid objects that are available in every template context.
 * These do not need to appear in each route's `context` array to be valid.
 * See: https://shopify.dev/docs/api/liquid/objects
 */
export const GLOBAL_LIQUID_OBJECTS: ReadonlySet<string> = new Set([
  'shop',
  'settings',
  'request',
  'routes',
  'linklists',
  'content_for_header',
  'content_for_layout',
  'content_for_index',
  'pages',
  'blogs',
  'collections',
  'all_products',
  'customer',
  'localization',
  'predictive_search',
  'recommendations',
  'powered_by_link',
  'canonical_url',
  'section',   // available in section files (section.settings.*, section.blocks)
  'block',     // available inside {% for block in section.blocks %}
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WarningType = 'context_mismatch' | 'unused_mapping';

export interface ValidationWarning {
  type: WarningType;
  /** Human-readable description of the issue. */
  message: string;
  /** The tap()-mapped variable name (component source identifier). */
  variable: string;
  /** The full Liquid expression string from the tap() call. */
  liquidExpr: string;
}

export interface BuildManifest {
  brand: string;
  locale: string;
  /** Relative paths of Shopify template files written. */
  templates: string[];
  /** Relative paths of Shopify snippet files written. */
  snippets: string[];
  /** Relative paths of Shopify section files written. */
  sections: string[];
  /** Relative paths of JS/CSS asset files written. */
  assets: string[];
  /** Relative paths of locale JSON files copied. */
  locales: string[];
}

// ---------------------------------------------------------------------------
// extractLiquidObjects()
// ---------------------------------------------------------------------------

/**
 * Extracts the top-level Liquid object names referenced in a tap() mapping value.
 *
 * Examples:
 *   '{{ product.title }}'                     → ['product']
 *   '{{ product.price | money }}'             → ['product']
 *   '{{ shop.name }}'                         → ['shop']
 *   "{{ 'product.add_to_cart' | t }}"         → []  (string literal, no object)
 *   'product'                                 → ['product'] (bare object ref)
 *   '{{ cart.item_count }}'                   → ['cart']
 */
export function extractLiquidObjects(liquidExpr: string): string[] {
  const stripped = stripLiquidBraces(liquidExpr);
  if (!stripped) return [];

  // Strip Liquid filters — keep only the expression before the first |
  const baseExpr = stripped.split('|')[0].trim();

  // String literal — e.g. 'product.add_to_cart' | t — has no object
  if (baseExpr.startsWith("'") || baseExpr.startsWith('"')) return [];

  // Extract the leading identifier (the root object name)
  const match = baseExpr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
  if (!match) return [];

  return [match[1]];
}

// ---------------------------------------------------------------------------
// validateTapMappings()
// ---------------------------------------------------------------------------

/**
 * Returns a warning for each tap() mapping that references a Liquid object
 * not available in the given route context (and not in GLOBAL_LIQUID_OBJECTS).
 *
 * Example: using `{{ product.title }}` in an index route (which only has
 * `shop` in its context) would produce a context_mismatch warning.
 */
export function validateTapMappings(
  mappings: TapMapping,
  routeContext: string[],
): ValidationWarning[] {
  const available = new Set([...routeContext, ...GLOBAL_LIQUID_OBJECTS]);
  const warnings: ValidationWarning[] = [];

  for (const [variable, liquidExpr] of Object.entries(mappings)) {
    const objects = extractLiquidObjects(liquidExpr);
    for (const obj of objects) {
      if (!available.has(obj)) {
        const contextList = routeContext.length > 0 ? routeContext.join(', ') : '(none)';
        warnings.push({
          type: 'context_mismatch',
          message:
            `Variable '${variable}' uses '{{ ${obj}.* }}' which is not available in ` +
            `this route's Liquid context. ` +
            `Route context: [${contextList}]. ` +
            `Check that the tap() expression matches the Liquid objects for this template.`,
          variable,
          liquidExpr,
        });
      }
    }
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// validateUnusedMappings()
// ---------------------------------------------------------------------------

/**
 * Returns a warning for each tap() mapping whose Liquid path does not appear
 * anywhere in the generated Liquid output.
 *
 * A mapping is "unused in liquid" when the variable was extracted from tap()
 * but its JSX usage was never compiled to a Liquid expression — for example,
 * because it is used only inside a client-side event handler.
 *
 * Note: variables that appear in data-props (e.g. for hydration) ARE counted
 * as "used" because their Liquid path appears in the data-props attribute.
 *
 * Skips synthetic inline tap() variable names (prefixed with __tap_inline_).
 */
export function validateUnusedMappings(
  mappings: TapMapping,
  liquidOutput: string,
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  for (const [variable, liquidExpr] of Object.entries(mappings)) {
    // Skip synthetic names generated by tap-extract for inline tap() calls
    if (variable.startsWith('__tap_inline_')) continue;

    const stripped = stripLiquidBraces(liquidExpr);

    // Skip string literals (e.g. 'product.add_to_cart' for t() filter)
    const baseExpr = stripped.split('|')[0].trim();
    if (baseExpr.startsWith("'") || baseExpr.startsWith('"')) continue;

    // Use the base Liquid path (before any filters) as the search string
    if (baseExpr && !liquidOutput.includes(baseExpr)) {
      warnings.push({
        type: 'unused_mapping',
        message:
          `Variable '${variable}' was extracted from tap() but '${baseExpr}' does not ` +
          `appear in the generated Liquid output. It may be used only client-side ` +
          `(event handlers, reactive computations), which is fine — this is informational.`,
        variable,
        liquidExpr,
      });
    }
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// generateManifest()
// ---------------------------------------------------------------------------

/**
 * Generates a build manifest object summarising all files emitted during
 * this build. Written to `manifest.json` in the theme output directory.
 */
export function generateManifest(
  brand: string,
  locale: string,
  files: {
    templates: string[];
    snippets: string[];
    sections?: string[];
    assets: string[];
    locales: string[];
  },
): BuildManifest {
  return {
    brand,
    locale,
    templates: [...files.templates].sort(),
    snippets: [...files.snippets].sort(),
    sections: [...(files.sections ?? [])].sort(),
    assets: [...files.assets].sort(),
    locales: [...files.locales].sort(),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function stripLiquidBraces(s: string): string {
  const trimmed = s.trim();
  if (trimmed.startsWith('{{') && trimmed.endsWith('}}')) {
    return trimmed.slice(2, -2).trim();
  }
  return trimmed;
}
