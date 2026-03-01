/**
 * hash.ts
 *
 * Phase 7: Content hashing for asset cache busting.
 *
 * Shopify themes are served from a CDN with long-lived cache headers.
 * Including a content hash in asset filenames ensures browsers and CDNs
 * pick up changes immediately after a new theme is published.
 *
 * The 8-character hex hash format matches Vite's default for JS chunks,
 * keeping all assets consistent.
 */

import { createHash } from 'node:crypto';

/**
 * Computes a short content hash for cache busting.
 *
 * Returns the first 8 hex characters of the SHA-256 digest of the input.
 * The same input always produces the same output (deterministic).
 *
 * hashContent('hello') → 'aaf4c61d'  (example)
 */
export function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex').slice(0, 8);
}

/**
 * Produces a versioned asset filename by inserting the hash before the
 * file extension — consistent with Vite's chunk naming convention.
 *
 * versionedName('theme.css', 'abc12345')       → 'theme-abc12345.css'
 * versionedName('theme.entry.js', 'abc12345')  → 'theme.entry-abc12345.js'
 * versionedName('logo', 'abc12345')            → 'logo-abc12345'
 */
export function versionedName(basename: string, hash: string): string {
  const lastDot = basename.lastIndexOf('.');
  if (lastDot === -1) return `${basename}-${hash}`;
  return `${basename.slice(0, lastDot)}-${hash}${basename.slice(lastDot)}`;
}

/**
 * Parses a versioned filename produced by `versionedName()` back into
 * its original base name and hash.
 *
 * Returns null if the filename does not match the versioned format.
 *
 * parseVersionedName('theme-abc12345.css')      → { name: 'theme.css', hash: 'abc12345' }
 * parseVersionedName('theme.entry-abc12345.js') → { name: 'theme.entry.js', hash: 'abc12345' }
 * parseVersionedName('theme.css')               → null
 */
export function parseVersionedName(filename: string): { name: string; hash: string } | null {
  // Match: <base>-<8 hex chars><ext>
  const match = filename.match(/^(.+)-([0-9a-f]{8})(\.[^.]+)$/);
  if (!match) return null;
  return { name: match[1] + match[3], hash: match[2] };
}
