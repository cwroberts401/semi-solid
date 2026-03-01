/**
 * product-section-output.test.ts
 *
 * Validates the full liquid output generated from ProductSection.tsx,
 * confirming the sections/blocks approach compiles correctly end-to-end.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractTapMappings } from '../src/tap-extract';
import { generateLiquid } from '../src/liquid-gen';
import { extractSectionSchema, formatSchemaTag } from '../src/section-schema';

const srcPath = join(import.meta.dirname, '../../../src/sections/ProductSection.tsx');
const src = readFileSync(srcPath, 'utf8');

describe('ProductSection.tsx → sections/product-section.liquid', () => {
  it('extracts 4 tap() mappings (blocks, title, price, description)', () => {
    const { mappings, warnings } = extractTapMappings(src, 'ProductSection.tsx');
    expect(warnings).toHaveLength(0);
    expect(mappings.blocks).toBe('{{ section.blocks }}');
    expect(mappings.title).toBe('{{ product.title }}');
    expect(mappings.price).toBe('{{ product.price | money }}');
    expect(mappings.description).toBe('{{ product.description }}');
  });

  it('detects the schema export', () => {
    const schema = extractSectionSchema(src) as Record<string, unknown>;
    expect(schema).not.toBeNull();
    expect(schema.name).toBe('Product');
    expect(Array.isArray(schema.blocks)).toBe(true);
    const blockTypes = (schema.blocks as Array<{ type: string }>).map((b) => b.type);
    expect(blockTypes).toEqual(['title', 'price', 'description', 'variant_picker', 'buy_buttons']);
  });

  it('generates a {% for block in section.blocks %} loop', () => {
    const { mappings } = extractTapMappings(src, 'ProductSection.tsx');
    const liquid = generateLiquid(src, mappings, { componentName: 'ProductSection' });
    expect(liquid).toContain('{% for block in section.blocks %}');
    expect(liquid).toContain('{% endfor %}');
  });

  it('generates {% case block.type %} with all five {% when %} branches', () => {
    const { mappings } = extractTapMappings(src, 'ProductSection.tsx');
    const liquid = generateLiquid(src, mappings, { componentName: 'ProductSection' });
    expect(liquid).toContain('{% case block.type %}');
    expect(liquid).toContain("{% when 'title' %}");
    expect(liquid).toContain("{% when 'price' %}");
    expect(liquid).toContain("{% when 'description' %}");
    expect(liquid).toContain("{% when 'variant_picker' %}");
    expect(liquid).toContain("{% when 'buy_buttons' %}");
    expect(liquid).toContain('{% endcase %}');
  });

  it('emits {{ block.shopify_attributes }} on each block element', () => {
    const { mappings } = extractTapMappings(src, 'ProductSection.tsx');
    const liquid = generateLiquid(src, mappings, { componentName: 'ProductSection' });
    // blockAttrs() spread appears on h1, p, divs — should appear multiple times
    const matches = liquid.match(/\{\{\ block\.shopify_attributes\ \}\}/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(5); // one per Case branch
  });

  it('renders product values as Liquid expressions', () => {
    const { mappings } = extractTapMappings(src, 'ProductSection.tsx');
    const liquid = generateLiquid(src, mappings, { componentName: 'ProductSection' });
    expect(liquid).toContain('{{ product.title }}');
    expect(liquid).toContain('{{ product.price | money }}');
    expect(liquid).toContain('{{ product.description }}');
  });

  it('renders the image gallery via {% render %} outside the blocks loop', () => {
    const { mappings } = extractTapMappings(src, 'ProductSection.tsx');
    const liquid = generateLiquid(src, mappings, { componentName: 'ProductSection' });
    expect(liquid).toContain("{% render 'image-gallery'");
    // It should come before the for loop (left column)
    const galleryPos = liquid.indexOf("{% render 'image-gallery'");
    const forPos = liquid.indexOf('{% for block in section.blocks %}');
    expect(galleryPos).toBeLessThan(forPos);
  });

  it('renders VariantSelector and AddToCartButton via {% render %} inside their blocks', () => {
    const { mappings } = extractTapMappings(src, 'ProductSection.tsx');
    const liquid = generateLiquid(src, mappings, { componentName: 'ProductSection' });
    expect(liquid).toContain("{% render 'variant-selector'");
    expect(liquid).toContain("{% render 'add-to-cart-button'");
    // Both should appear after the for loop start
    const forPos = liquid.indexOf('{% for block in section.blocks %}');
    expect(liquid.indexOf("{% render 'variant-selector'")).toBeGreaterThan(forPos);
    expect(liquid.indexOf("{% render 'add-to-cart-button'")).toBeGreaterThan(forPos);
  });

  it('appends a {% schema %} tag with all block types', () => {
    const schema = extractSectionSchema(src)!;
    const schemaTag = formatSchemaTag(schema);
    expect(schemaTag).toContain('{% schema %}');
    expect(schemaTag).toContain('"name": "Product"');
    expect(schemaTag).toContain('"type": "title"');
    expect(schemaTag).toContain('"type": "price"');
    expect(schemaTag).toContain('"type": "description"');
    expect(schemaTag).toContain('"type": "variant_picker"');
    expect(schemaTag).toContain('"type": "buy_buttons"');
    expect(schemaTag).toContain('{% endschema %}');
  });

  it('prints the full liquid output for visual inspection', () => {
    const { mappings } = extractTapMappings(src, 'ProductSection.tsx');
    const liquid = generateLiquid(src, mappings, { componentName: 'ProductSection' });
    const schema = extractSectionSchema(src)!;
    const full = liquid + '\n' + formatSchemaTag(schema);
    console.log('\n=== sections/product-section.liquid ===\n');
    console.log(full);
    console.log('=== end ===\n');
    expect(full.length).toBeGreaterThan(0);
  });
});
