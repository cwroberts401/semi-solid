/**
 * route-map.ts
 *
 * Maps src/routes/+layout.tsx to Shopify layout/theme.liquid.
 *
 * Page templates are now JSON files in templates/ (copied directly to dist).
 * Only the layout file needs the tap-extract → liquid-gen pipeline.
 */

import path from 'node:path';

export interface RouteInfo {
  /** Shopify template identifier, e.g. '_layout' */
  template: string;
  /** Relative output path from the theme root, e.g. 'layout/theme.liquid' */
  outputPath: string;
  /** Liquid context objects available in this template */
  context: string[];
  /** Whether this is the layout file (+layout.tsx → layout/theme.liquid) */
  isLayout: boolean;
}

/**
 * Given a route file's absolute path and the routes directory, returns
 * the RouteInfo describing the Shopify output for that file.
 *
 * Only +layout files are recognized. All other route files return null
 * since page templates are now JSON files in templates/.
 */
export function resolveRoute(filePath: string, routesDir: string): RouteInfo | null {
  const rel = path.relative(routesDir, filePath).replace(/\.(tsx|jsx|ts|js)$/, '');
  const normalized = rel.replace(/\\/g, '/');

  if (/^\+layout$/.test(normalized)) {
    return {
      template: '_layout',
      outputPath: 'layout/theme.liquid',
      context: ['shop', 'cart', 'request'],
      isLayout: true,
    };
  }

  return null;
}

/**
 * Returns true if the file is inside src/routes/.
 */
export function isRouteFile(filePath: string, projectRoot: string): boolean {
  const routesDir = getRoutesDir(projectRoot);
  const normalized = filePath.replace(/\\/g, '/');
  const normalizedRoutesDir = routesDir.replace(/\\/g, '/');
  return normalized.startsWith(normalizedRoutesDir + '/');
}

/**
 * Returns the absolute path to the routes directory for a project root.
 */
export function getRoutesDir(projectRoot: string): string {
  return path.join(projectRoot, 'src', 'routes');
}
