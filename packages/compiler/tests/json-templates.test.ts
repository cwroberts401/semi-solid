import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const TEMPLATES_DIR = path.resolve(__dirname, '../../../src/templates');

/** Known section component names (kebab-case) that JSON templates may reference. */
const KNOWN_SECTION_TYPES = new Set([
  'index-content',
  'product-section',
  'collection-section',
  'featured-product',
]);

describe('JSON templates', () => {
  const templateFiles = fs.existsSync(TEMPLATES_DIR)
    ? fs.readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith('.json'))
    : [];

  it('templates/ directory exists and contains JSON files', () => {
    expect(fs.existsSync(TEMPLATES_DIR)).toBe(true);
    expect(templateFiles.length).toBeGreaterThan(0);
  });

  for (const file of templateFiles) {
    describe(file, () => {
      const filePath = path.join(TEMPLATES_DIR, file);
      let parsed: Record<string, unknown>;

      it('is valid JSON', () => {
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(() => {
          parsed = JSON.parse(content);
        }).not.toThrow();
      });

      it('has sections and order keys', () => {
        const content = fs.readFileSync(filePath, 'utf-8');
        parsed = JSON.parse(content);
        expect(parsed).toHaveProperty('sections');
        expect(parsed).toHaveProperty('order');
        expect(Array.isArray(parsed.order)).toBe(true);
      });

      it('order entries match section keys', () => {
        const content = fs.readFileSync(filePath, 'utf-8');
        parsed = JSON.parse(content);
        const sections = parsed.sections as Record<string, unknown>;
        const order = parsed.order as string[];
        for (const key of order) {
          expect(sections).toHaveProperty(key);
        }
      });

      it('referenced section types are known', () => {
        const content = fs.readFileSync(filePath, 'utf-8');
        parsed = JSON.parse(content);
        const sections = parsed.sections as Record<string, { type?: string }>;
        for (const [, section] of Object.entries(sections)) {
          if (section.type) {
            expect(KNOWN_SECTION_TYPES).toContain(section.type);
          }
        }
      });
    });
  }
});
