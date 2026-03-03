/**
 * product-image-gallery-output.test.ts
 *
 * Validates the liquid output generated from ProductImageGallery.tsx,
 * confirming schema extraction and inlined image gallery markup.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractTapMappings } from '../src/tap-extract';
import { generateLiquid } from '../src/liquid-gen';
import { extractSectionSchema, formatSchemaTag } from '../src/section-schema';

const srcPath = join(import.meta.dirname, '../../../src/sections/ProductImageGallery.tsx');
const src = readFileSync(srcPath, 'utf8');

describe('ProductImageGallery.tsx → sections/product-image-gallery.liquid', () => {
  it('extracts 1 tap() mapping (images)', () => {
    const { mappings, warnings } = extractTapMappings(src, 'ProductImageGallery.tsx');
    expect(warnings).toHaveLength(0);
    expect(mappings.images).toBe('product.images');
  });

  it('detects the schema export', () => {
    const schema = extractSectionSchema(src) as Record<string, unknown>;
    expect(schema).not.toBeNull();
    expect(schema.name).toBe('Product Image Gallery');
  });

  it('schema has no blocks defined', () => {
    const schema = extractSectionSchema(src) as Record<string, unknown>;
    expect(schema.blocks).toBeUndefined();
  });

  it('generates a {% for image in product.images %} loop', () => {
    const { mappings } = extractTapMappings(src, 'ProductImageGallery.tsx');
    const liquid = generateLiquid(src, mappings, { componentName: 'ProductImageGallery' });
    expect(liquid).toContain('{% for image in product.images %}');
    expect(liquid).toContain('{% endfor %}');
  });

  it('renders image src with image_url filter and alt as Liquid expressions', () => {
    const { mappings } = extractTapMappings(src, 'ProductImageGallery.tsx');
    const liquid = generateLiquid(src, mappings, { componentName: 'ProductImageGallery' });
    expect(liquid).toContain('{{ image | image_url: width: 800 }}');
    expect(liquid).toContain('{{ image.alt }}');
  });

  it('does not contain a {% render %} tag', () => {
    const { mappings } = extractTapMappings(src, 'ProductImageGallery.tsx');
    const liquid = generateLiquid(src, mappings, { componentName: 'ProductImageGallery' });
    expect(liquid).not.toContain('{% render');
  });

  it('appends a {% schema %} tag', () => {
    const schema = extractSectionSchema(src)!;
    const schemaTag = formatSchemaTag(schema);
    expect(schemaTag).toContain('{% schema %}');
    expect(schemaTag).toContain('"name": "Product Image Gallery"');
    expect(schemaTag).toContain('{% endschema %}');
  });

  it('prints the full liquid output for visual inspection', () => {
    const { mappings } = extractTapMappings(src, 'ProductImageGallery.tsx');
    const liquid = generateLiquid(src, mappings, { componentName: 'ProductImageGallery' });
    const schema = extractSectionSchema(src)!;
    const full = liquid + '\n' + formatSchemaTag(schema);
    console.log('\n=== sections/product-image-gallery.liquid ===\n');
    console.log(full);
    console.log('=== end ===\n');
    expect(full.length).toBeGreaterThan(0);
  });
});
