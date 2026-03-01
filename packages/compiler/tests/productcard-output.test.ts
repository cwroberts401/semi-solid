/**
 * Phase 2 milestone validation:
 * Shows the actual liquid output generated from ProductCard.tsx.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractTapMappings } from '../src/tap-extract';
import { generateLiquid } from '../src/liquid-gen';

const srcPath = join(import.meta.dirname, '../../../src/snippets/ProductCard.tsx');
const src = readFileSync(srcPath, 'utf8');

describe('ProductCard.tsx → product-card.liquid (Phase 2 milestone)', () => {
  it('extracts all 5 tap() mappings', () => {
    const { mappings, warnings } = extractTapMappings(src, 'ProductCard.tsx');
    expect(warnings).toHaveLength(0);
    expect(mappings.title).toBe('{{ product.title }}');
    expect(mappings.price).toBe('{{ product.price | money }}');
    expect(mappings.imageUrl).toContain('img_url');
    expect(mappings.variantId).toBe('{{ product.selected_or_first_available_variant.id }}');
    expect(mappings.available).toBe('{{ product.available }}');
  });

  it('produces correct Liquid with {% if %} / {% else %} for <Show>', () => {
    const { mappings } = extractTapMappings(src, 'ProductCard.tsx');
    const liquid = generateLiquid(src, mappings, { componentName: 'ProductCard' });

    // Tap-mapped values appear as Liquid expressions
    expect(liquid).toContain('{{ product.title }}');
    expect(liquid).toContain('{{ product.price | money }}');
    expect(liquid).toContain("{{ product.featured_image | img_url: '600x' }}");

    // Phase 2: Show compiles to if/else
    expect(liquid).toContain('{% if product.available %}');
    expect(liquid).toContain('{% else %}');
    expect(liquid).toContain('{% endif %}');

    // Fallback branch has sold-out translation
    expect(liquid).toContain("{{ 'product.sold_out' | t }}");

    // No fallback values, no event handlers
    expect(liquid).not.toContain('$0.00');
    expect(liquid).not.toContain('onClick');
    expect(liquid).not.toContain('addToCart');
  });

  it('prints the full liquid output for visual inspection', () => {
    const { mappings } = extractTapMappings(src, 'ProductCard.tsx');
    const liquid = generateLiquid(src, mappings, { componentName: 'ProductCard' });
    console.log('\n=== product-card.liquid (Phase 2) ===\n');
    console.log(liquid);
    console.log('=== end ===\n');
    expect(liquid.length).toBeGreaterThan(0);
  });
});
