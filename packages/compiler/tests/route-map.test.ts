import { describe, it, expect } from 'vitest';
import { resolveRoute, isRouteFile, getRoutesDir } from '../src/route-map';

const ROUTES_DIR = '/project/src/routes';
const PROJECT_ROOT = '/project';

describe('resolveRoute()', () => {
  describe('+layout', () => {
    it('maps +layout.tsx to layout/theme.liquid', () => {
      const info = resolveRoute(`${ROUTES_DIR}/+layout.tsx`, ROUTES_DIR);
      expect(info).not.toBeNull();
      expect(info!.outputPath).toBe('layout/theme.liquid');
      expect(info!.isLayout).toBe(true);
    });

    it('includes shop/cart/request in layout context', () => {
      const info = resolveRoute(`${ROUTES_DIR}/+layout.tsx`, ROUTES_DIR);
      expect(info!.context).toContain('shop');
      expect(info!.context).toContain('cart');
      expect(info!.context).toContain('request');
    });

    it('works with .jsx extension', () => {
      const info = resolveRoute(`${ROUTES_DIR}/+layout.jsx`, ROUTES_DIR);
      expect(info).not.toBeNull();
      expect(info!.outputPath).toBe('layout/theme.liquid');
    });

    it('works with .ts extension', () => {
      const info = resolveRoute(`${ROUTES_DIR}/+layout.ts`, ROUTES_DIR);
      expect(info).not.toBeNull();
      expect(info!.outputPath).toBe('layout/theme.liquid');
    });
  });

  describe('non-layout routes return null (templates are now JSON)', () => {
    it('returns null for index route', () => {
      expect(resolveRoute(`${ROUTES_DIR}/index.tsx`, ROUTES_DIR)).toBeNull();
    });

    it('returns null for product route', () => {
      expect(resolveRoute(`${ROUTES_DIR}/products/[handle].tsx`, ROUTES_DIR)).toBeNull();
    });

    it('returns null for collection route', () => {
      expect(resolveRoute(`${ROUTES_DIR}/collections/[handle].tsx`, ROUTES_DIR)).toBeNull();
    });

    it('returns null for cart route', () => {
      expect(resolveRoute(`${ROUTES_DIR}/cart.tsx`, ROUTES_DIR)).toBeNull();
    });

    it('returns null for unknown routes', () => {
      expect(resolveRoute(`${ROUTES_DIR}/unknown-page.tsx`, ROUTES_DIR)).toBeNull();
      expect(resolveRoute(`${ROUTES_DIR}/deeply/nested/unknown.tsx`, ROUTES_DIR)).toBeNull();
    });
  });
});

describe('isRouteFile()', () => {
  it('returns true for files inside src/routes/', () => {
    expect(isRouteFile(`${PROJECT_ROOT}/src/routes/+layout.tsx`, PROJECT_ROOT)).toBe(true);
    expect(isRouteFile(`${PROJECT_ROOT}/src/routes/index.tsx`, PROJECT_ROOT)).toBe(true);
    expect(isRouteFile(`${PROJECT_ROOT}/src/routes/products/[handle].tsx`, PROJECT_ROOT)).toBe(true);
  });

  it('returns false for component files', () => {
    expect(isRouteFile(`${PROJECT_ROOT}/src/components/base/ProductCard.tsx`, PROJECT_ROOT)).toBe(false);
  });

  it('returns false for lib files', () => {
    expect(isRouteFile(`${PROJECT_ROOT}/src/lib/runtime.ts`, PROJECT_ROOT)).toBe(false);
  });
});

describe('getRoutesDir()', () => {
  it('returns a path containing src and routes', () => {
    const dir = getRoutesDir(PROJECT_ROOT);
    expect(dir).toContain('src');
    expect(dir).toContain('routes');
  });
});
