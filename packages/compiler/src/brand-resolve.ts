/**
 * brand-resolve.ts
 *
 * Vite plugin that resolves `$snippets/`, `$sections/`, and `$blocks/` imports
 * to either:
 *   1. src/brands/{brand}/{category}/ComponentName.tsx  — brand-specific override
 *   2. src/{category}/ComponentName.tsx                 — base component fallback
 *
 * Resolution stops at the first match. If neither exists, the plugin returns
 * null and Vite continues with its normal alias/module resolution.
 *
 * Usage in vite.config.ts (must come BEFORE solidPlugin):
 *   plugins: [createBrandResolver('brand-a'), solidPlugin(), semiSolidPlugin(...)]
 *
 * Component imports opt into brand resolution by using category prefixes:
 *   import ProductCard from '$snippets/ProductCard';     // ← brand-resolved
 *   import ProductSection from '$sections/ProductSection'; // ← brand-resolved
 *   import ImageGallery from '$blocks/ImageGallery';     // ← brand-resolved
 *   import Something from '../relative/path';            // ← not resolved here
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/** Supported file extensions, checked in preference order. */
const EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'] as const;

/** Category prefixes mapped to their directory names. */
const CATEGORY_PREFIXES: Record<string, string> = {
  '$snippets/': 'snippets',
  '$sections/': 'sections',
  '$blocks/': 'blocks',
};

/**
 * Resolves a component name within a specific category to an absolute file path.
 *
 * Pure function — injectable `existsSync` makes it unit-testable without
 * hitting the real filesystem.
 *
 * @param componentPath - The import path after the category prefix, e.g. 'ProductCard'
 * @param category      - Category directory name: 'snippets', 'sections', or 'blocks'
 * @param brand         - Brand identifier, e.g. 'brand-a'
 * @param projectRoot   - Absolute project root path
 * @param existsSync    - File existence check (defaults to fs.existsSync)
 */
export function resolveCategoryBrandPath(
  componentPath: string,
  category: string,
  brand: string,
  projectRoot: string,
  existsSync: (p: string) => boolean = fs.existsSync,
): string | null {
  // Strip any extension the caller may have included; we probe all extensions.
  const nameNoExt = componentPath.replace(/\.(tsx|jsx|ts|js)$/, '');

  // 1. Brand-specific override
  const overrideBase = path.join(
    projectRoot, 'src', 'brands', brand, category, nameNoExt,
  );
  for (const ext of EXTENSIONS) {
    const candidate = overrideBase + ext;
    if (existsSync(candidate)) return candidate;
  }

  // 2. Base component fallback
  const baseComponentBase = path.join(
    projectRoot, 'src', category, nameNoExt,
  );
  for (const ext of EXTENSIONS) {
    const candidate = baseComponentBase + ext;
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

/**
 * Resolves a component name by searching across all categories.
 *
 * Used by the plugin's buildStart to locate components without knowing
 * which category they belong to.
 *
 * @param componentPath - The component name, e.g. 'ProductCard'
 * @param brand         - Brand identifier, e.g. 'brand-a'
 * @param projectRoot   - Absolute project root path
 * @param existsSync    - File existence check (defaults to fs.existsSync)
 */
export function resolveBrandPath(
  componentPath: string,
  brand: string,
  projectRoot: string,
  existsSync: (p: string) => boolean = fs.existsSync,
): string | null {
  for (const category of ['snippets', 'sections', 'blocks']) {
    const result = resolveCategoryBrandPath(componentPath, category, brand, projectRoot, existsSync);
    if (result) return result;
  }
  return null;
}

/**
 * Creates a Vite plugin that performs brand-aware component resolution for
 * all `$snippets/*`, `$sections/*`, and `$blocks/*` imports.
 *
 * @param brand       - Brand identifier, e.g. 'brand-a'
 * @param projectRoot - Optional: explicit project root (mainly for testing)
 */
export function createBrandResolver(brand: string, projectRoot?: string): Plugin {
  let resolvedRoot = projectRoot ?? process.cwd();

  return {
    name: 'semi-solid-brand-resolve',

    configResolved(config) {
      // If projectRoot wasn't explicitly provided, use the Vite config root.
      if (!projectRoot) {
        resolvedRoot = config.root;
      }
    },

    resolveId(source: string) {
      for (const [prefix, category] of Object.entries(CATEGORY_PREFIXES)) {
        if (source.startsWith(prefix)) {
          const componentPath = source.slice(prefix.length);
          return resolveCategoryBrandPath(componentPath, category, brand, resolvedRoot);
        }
      }
      return null;
    },
  };
}
