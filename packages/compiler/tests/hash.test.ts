/**
 * hash.test.ts
 *
 * Tests for Phase 7: asset content hashing and versioned filenames.
 */

import { describe, it, expect } from 'vitest';
import { hashContent, versionedName, parseVersionedName } from '../src/hash';

// ---------------------------------------------------------------------------
// hashContent()
// ---------------------------------------------------------------------------

describe('hashContent()', () => {
  it('returns an 8-character string', () => {
    expect(hashContent('hello world')).toHaveLength(8);
  });

  it('returns only hex characters', () => {
    expect(hashContent('hello world')).toMatch(/^[0-9a-f]{8}$/);
  });

  it('is deterministic — same input produces same output', () => {
    const content = 'body { color: red; }';
    expect(hashContent(content)).toBe(hashContent(content));
  });

  it('produces different hashes for different content', () => {
    expect(hashContent('content-a')).not.toBe(hashContent('content-b'));
  });

  it('produces different hashes for whitespace differences', () => {
    expect(hashContent('a b')).not.toBe(hashContent('a  b'));
  });

  it('handles empty string without throwing', () => {
    expect(() => hashContent('')).not.toThrow();
    expect(hashContent('')).toHaveLength(8);
  });

  it('handles large content', () => {
    const large = 'x'.repeat(100_000);
    expect(hashContent(large)).toHaveLength(8);
  });
});

// ---------------------------------------------------------------------------
// versionedName()
// ---------------------------------------------------------------------------

describe('versionedName()', () => {
  it('inserts the hash before a single extension', () => {
    expect(versionedName('theme.css', 'abc12345')).toBe('theme-abc12345.css');
  });

  it('inserts the hash before the last extension for dotted names', () => {
    expect(versionedName('theme.entry.js', 'abc12345')).toBe('theme.entry-abc12345.js');
  });

  it('appends the hash for names with no extension', () => {
    expect(versionedName('logo', 'abc12345')).toBe('logo-abc12345');
  });

  it('works with real hash values', () => {
    const hash = hashContent('body { color: red; }');
    const result = versionedName('theme.css', hash);
    expect(result).toMatch(/^theme-[0-9a-f]{8}\.css$/);
  });

  it('preserves the file extension exactly', () => {
    expect(versionedName('styles.min.css', 'abc12345')).toBe('styles.min-abc12345.css');
  });
});

// ---------------------------------------------------------------------------
// parseVersionedName()
// ---------------------------------------------------------------------------

describe('parseVersionedName()', () => {
  it('parses a versioned CSS filename', () => {
    const result = parseVersionedName('theme-abc12345.css');
    expect(result).toEqual({ name: 'theme.css', hash: 'abc12345' });
  });

  it('parses a versioned JS filename with dots in name', () => {
    const result = parseVersionedName('theme.entry-abc12345.js');
    expect(result).toEqual({ name: 'theme.entry.js', hash: 'abc12345' });
  });

  it('returns null for a non-versioned filename', () => {
    expect(parseVersionedName('theme.css')).toBeNull();
  });

  it('returns null for a filename without an extension', () => {
    expect(parseVersionedName('theme-abc12345')).toBeNull();
  });

  it('returns null when hash is not exactly 8 hex chars', () => {
    expect(parseVersionedName('theme-abc123.css')).toBeNull();   // 6 chars
    expect(parseVersionedName('theme-abc123456.css')).toBeNull(); // 9 chars
  });

  it('returns null for non-hex hash characters', () => {
    expect(parseVersionedName('theme-ABCD1234.css')).toBeNull(); // uppercase
    expect(parseVersionedName('theme-ghij1234.css')).toBeNull(); // non-hex letters
  });

  it('round-trips with versionedName()', () => {
    const hash = hashContent('some CSS content');
    const versioned = versionedName('theme.css', hash);
    const parsed = parseVersionedName(versioned);
    expect(parsed).toEqual({ name: 'theme.css', hash });
  });
});
