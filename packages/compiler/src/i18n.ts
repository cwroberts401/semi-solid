/**
 * i18n.ts
 *
 * Utilities for locale file resolution during the build step.
 *
 * Shopify theme locales directory conventions:
 *   locales/
 *     en.default.json   ← the locale this theme build is primary for
 *     fr.json           ← additional locales understood by the storefront
 *     de.json
 *
 * Source locale files live at:
 *   src/brands/{brand}/i18n/{locale}.json
 *
 * The `resolveLocaleFiles` function returns the {src, dest} pairs so
 * that the plugin can copy them without knowing filesystem details
 * itself — the pure function form also makes unit-testing trivial.
 *
 * The `VIRTUAL_LOCALE_MODULE` id is provided to the Vite plugin so
 * JS bundles can import the locale data at build time:
 *
 *   import translations from 'virtual:semi-solid/locale';
 *   setTranslations(translations);
 */

import path from 'node:path';
import fs from 'node:fs';

/** Vite virtual module id for the active locale JSON. */
export const VIRTUAL_LOCALE_MODULE = 'virtual:semi-solid/locale';

/** The internal (resolved) id used inside Vite's module graph. */
const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_LOCALE_MODULE;

export interface LocaleFilePair {
  /** Absolute path to the source JSON in src/brands/{brand}/i18n/ */
  src: string;
  /** Absolute path to the destination inside the Shopify locales/ dir */
  dest: string;
}

/**
 * Determines all locale file copy pairs for a brand+locale build.
 *
 * The active `locale` is written as `{locale}.default.json` in the
 * output; all other JSON files in the i18n directory keep their name
 * (e.g. `fr.json` stays `fr.json`).
 *
 * Returns an empty array if the i18n source directory doesn't exist.
 *
 * @param brand       - Brand identifier, e.g. 'brand-a'
 * @param locale      - Active build locale, e.g. 'en'
 * @param projectRoot - Absolute path to the project root
 * @param outDir      - Absolute path to the Shopify theme output directory
 * @param existsSync  - Directory existence check (injectable for testing)
 * @param readdirSync - Directory listing returning filenames (injectable)
 */
export function resolveLocaleFiles(
  brand: string,
  locale: string,
  projectRoot: string,
  outDir: string,
  existsSync: (p: string) => boolean = fs.existsSync,
  readdirSync: (dir: string) => string[] = (d) => fs.readdirSync(d) as string[],
): LocaleFilePair[] {
  const i18nDir = path.join(projectRoot, 'src', 'brands', brand, 'i18n');
  const localesOutDir = path.join(outDir, 'locales');

  if (!existsSync(i18nDir)) return [];

  const files = readdirSync(i18nDir).filter((f) => f.endsWith('.json'));

  return files.map((file) => {
    const lang = file.replace(/\.json$/, '');
    const destName = lang === locale ? `${locale}.default.json` : file;
    return {
      src: path.join(i18nDir, file),
      dest: path.join(localesOutDir, destName),
    };
  });
}

/**
 * Returns the absolute path to the active locale JSON file for a build,
 * or null if it doesn't exist.
 *
 * Used by the plugin's virtual module to inline translations into the bundle.
 */
export function resolveActiveLocalePath(
  brand: string,
  locale: string,
  projectRoot: string,
  existsSync: (p: string) => boolean = fs.existsSync,
): string | null {
  const candidate = path.join(
    projectRoot, 'src', 'brands', brand, 'i18n', `${locale}.json`,
  );
  return existsSync(candidate) ? candidate : null;
}

/**
 * Returns the two virtual-module ids for use in a Vite plugin's
 * `resolveId` and `load` hooks.
 */
export const virtualLocaleIds = {
  external: VIRTUAL_LOCALE_MODULE,
  internal: RESOLVED_VIRTUAL_ID,
} as const;
