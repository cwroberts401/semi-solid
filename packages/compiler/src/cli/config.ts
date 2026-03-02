import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface BrandConfig {
  locales: string[];
  store?: string;
  storePassword?: string;
}

export interface SemiSolidConfig {
  brands: Record<string, BrandConfig>;
}

/**
 * Load the semi-solid config from the project root.
 *
 * Tries to import `semi-solid.config.ts` (via tsx runtime).
 * Falls back to auto-discovery from `src/brands/* /i18n/*.json`.
 */
export async function loadConfig(root: string): Promise<SemiSolidConfig> {
  const configPath = path.join(root, 'semi-solid.config.ts');

  if (fs.existsSync(configPath)) {
    const mod = await import(pathToFileURL(configPath).href);
    return mod.default as SemiSolidConfig;
  }

  // Auto-discover brands from src/brands/*/i18n/*.json
  const brandsDir = path.join(root, 'src', 'brands');
  const brands: Record<string, BrandConfig> = {};

  if (fs.existsSync(brandsDir)) {
    for (const brand of fs.readdirSync(brandsDir)) {
      const i18nDir = path.join(brandsDir, brand, 'i18n');
      if (!fs.existsSync(i18nDir)) continue;

      const locales = fs.readdirSync(i18nDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace(/\.json$/, ''));

      if (locales.length > 0) {
        brands[brand] = { locales };
      }
    }
  }

  return { brands };
}
