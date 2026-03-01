/**
 * collection-section-output.test.ts
 *
 * Validates the liquid output for CollectionSection.tsx end-to-end.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractTapMappings } from '../src/tap-extract';
import { generateLiquid } from '../src/liquid-gen';
import { extractSectionSchema, formatSchemaTag } from '../src/section-schema';

const srcPath = join(import.meta.dirname, '../../../src/sections/CollectionSection.tsx');
const src = readFileSync(srcPath, 'utf8');

describe('CollectionSection.tsx → sections/collection-section.liquid', () => {
  it('extracts 4 tap() mappings', () => {
    const { mappings, warnings } = extractTapMappings(src, 'CollectionSection.tsx');
    expect(warnings).toHaveLength(0);
    expect(mappings.blocks).toBe('{{ section.blocks }}');
    expect(mappings.title).toBe('{{ collection.title }}');
    expect(mappings.description).toBe('{{ collection.description }}');
    expect(mappings.products).toBe('{{ collection.products }}');
  });

  it('detects the schema export with header and product_grid blocks', () => {
    const schema = extractSectionSchema(src) as Record<string, unknown>;
    expect(schema).not.toBeNull();
    expect(schema.name).toBe('Collection');
    const blocks = schema.blocks as Array<{ type: string }>;
    expect(blocks.map((b) => b.type)).toEqual(['header', 'product_grid']);
  });

  it('generates an outer {% for block in section.blocks %} loop', () => {
    const { mappings } = extractTapMappings(src, 'CollectionSection.tsx');
    const liquid = generateLiquid(src, mappings, { componentName: 'CollectionSection' });
    expect(liquid).toContain('{% for block in section.blocks %}');
    expect(liquid).toContain('{% endfor %}');
  });

  it('generates {% case block.type %} with header and product_grid branches', () => {
    const { mappings } = extractTapMappings(src, 'CollectionSection.tsx');
    const liquid = generateLiquid(src, mappings, { componentName: 'CollectionSection' });
    expect(liquid).toContain('{% case block.type %}');
    expect(liquid).toContain("{% when 'header' %}");
    expect(liquid).toContain("{% when 'product_grid' %}");
    expect(liquid).toContain('{% endcase %}');
  });

  it('renders collection title and description in the header block', () => {
    const { mappings } = extractTapMappings(src, 'CollectionSection.tsx');
    const liquid = generateLiquid(src, mappings, { componentName: 'CollectionSection' });
    expect(liquid).toContain('{{ collection.title }}');
    expect(liquid).toContain('{{ collection.description }}');
  });

  it('generates a nested {% for product in collection.products %} loop', () => {
    const { mappings } = extractTapMappings(src, 'CollectionSection.tsx');
    const liquid = generateLiquid(src, mappings, { componentName: 'CollectionSection' });
    expect(liquid).toContain('{% for product in collection.products %}');
  });

  it('renders product member expressions as Liquid inside the inner loop', () => {
    const { mappings } = extractTapMappings(src, 'CollectionSection.tsx');
    const liquid = generateLiquid(src, mappings, { componentName: 'CollectionSection' });
    expect(liquid).toContain('{{ product.url }}');
    expect(liquid).toContain('{{ product.images.first | image_url: width: 600 }}');
    expect(liquid).toContain('{{ product.featured_image.alt }}');
    expect(liquid).toContain('{{ product.title }}');
    expect(liquid).toContain('{{ product.vendor }}');
    expect(liquid).toContain('{{ product.price }}');
  });

  it('emits {{ block.shopify_attributes }} on both block root elements', () => {
    const { mappings } = extractTapMappings(src, 'CollectionSection.tsx');
    const liquid = generateLiquid(src, mappings, { componentName: 'CollectionSection' });
    const matches = liquid.match(/\{\{ block\.shopify_attributes \}\}/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it('inner loop is nested inside the product_grid block', () => {
    const { mappings } = extractTapMappings(src, 'CollectionSection.tsx');
    const liquid = generateLiquid(src, mappings, { componentName: 'CollectionSection' });
    const gridPos = liquid.indexOf("{% when 'product_grid' %}");
    const innerForPos = liquid.indexOf('{% for product in collection.products %}');
    const endcasePos = liquid.indexOf('{% endcase %}');
    expect(innerForPos).toBeGreaterThan(gridPos);
    expect(innerForPos).toBeLessThan(endcasePos);
  });

  it('produces valid {% schema %} JSON with range and checkbox settings', () => {
    const schema = extractSectionSchema(src)!;
    const tag = formatSchemaTag(schema);
    expect(tag).toContain('"type": "range"');
    expect(tag).toContain('"id": "columns_desktop"');
    expect(tag).toContain('"type": "checkbox"');
    expect(tag).toContain('"id": "show_vendor"');
  });

  it('prints the full liquid output for visual inspection', () => {
    const { mappings } = extractTapMappings(src, 'CollectionSection.tsx');
    const liquid = generateLiquid(src, mappings, { componentName: 'CollectionSection' });
    const schema = extractSectionSchema(src)!;
    const full = liquid + '\n' + formatSchemaTag(schema);
    console.log('\n=== sections/collection-section.liquid ===\n');
    console.log(full);
    console.log('=== end ===\n');
    expect(full.length).toBeGreaterThan(0);
  });
});
