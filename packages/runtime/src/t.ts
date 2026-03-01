/**
 * Translation helper.
 *
 * At build time: the compiler replaces t('key') with {{ 'key' | t }}
 * in the generated Liquid output.
 *
 * At runtime: resolves the key against the locale JSON loaded at build
 * time via the $brand/i18n/$locale alias, falling back to the key itself.
 *
 * Usage:
 *   t('product.add_to_cart')           → 'Add to Cart'
 *   t('product.add_to_cart', 'Add')    → 'Add' if key is missing
 */

// Translations are injected by the build system via the $brand alias.
// In tests and Storybook, this resolves to an empty object.
let _translations: Record<string, unknown> = {};

export function setTranslations(translations: Record<string, unknown>): void {
  _translations = translations;
}

export function t(key: string, fallback?: string): string {
  const value = key.split('.').reduce<unknown>((obj, k) => {
    if (obj && typeof obj === 'object') {
      return (obj as Record<string, unknown>)[k];
    }
    return undefined;
  }, _translations);

  if (typeof value === 'string') return value;
  return fallback ?? key;
}
