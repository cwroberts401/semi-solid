import { describe, it, expect } from 'vitest';
import { extractTapMappings } from '../src/tap-extract';

describe('extractTapMappings()', () => {
  it('extracts a single variable tap() mapping', () => {
    const source = `
      import { tap } from '$lib/runtime';
      const title = tap('{{ product.title }}', 'Default Title');
    `;
    const { mappings } = extractTapMappings(source);
    expect(mappings).toEqual({ title: '{{ product.title }}' });
  });

  it('extracts multiple tap() mappings', () => {
    const source = `
      const title = tap('{{ product.title }}', 'Default');
      const price = tap('{{ product.price | money }}', '$0.00');
      const imageUrl = tap('{{ product.featured_image | img_url: \\'600x\\' }}', '');
    `;
    const { mappings } = extractTapMappings(source);
    expect(mappings.title).toBe('{{ product.title }}');
    expect(mappings.price).toBe('{{ product.price | money }}');
    expect(mappings.imageUrl).toContain('img_url');
  });

  it('replaces tap() with the fallback in cleanedSource', () => {
    const source = `const title = tap('{{ product.title }}', props.title ?? 'Default');`;
    const { cleanedSource } = extractTapMappings(source);
    expect(cleanedSource).not.toContain('tap(');
    expect(cleanedSource).toContain("props.title ?? 'Default'");
  });

  it('handles tap() with boolean fallback', () => {
    const source = `const available = tap('{{ product.available }}', true);`;
    const { mappings, cleanedSource } = extractTapMappings(source);
    expect(mappings.available).toBe('{{ product.available }}');
    expect(cleanedSource).not.toContain('tap(');
    expect(cleanedSource).toContain('true');
  });

  it('handles tap() with numeric fallback', () => {
    const source = `const qty = tap('{{ cart.item_count }}', 0);`;
    const { mappings, cleanedSource } = extractTapMappings(source);
    expect(mappings.qty).toBe('{{ cart.item_count }}');
    expect(cleanedSource).toContain('0');
    expect(cleanedSource).not.toContain('tap(');
  });

  it('returns empty mappings when no tap() calls exist', () => {
    const source = `
      function Foo() {
        const title = 'hello';
        return <h1>{title}</h1>;
      }
    `;
    const { mappings, cleanedSource } = extractTapMappings(source);
    expect(Object.keys(mappings)).toHaveLength(0);
    expect(cleanedSource).toContain("'hello'");
  });

  it('handles multiple tap() calls in the same declaration block', () => {
    const source = `
      const a = tap('{{ a }}', 1);
      const b = tap('{{ b }}', 2);
      const c = tap('{{ c }}', 3);
    `;
    const { mappings, cleanedSource } = extractTapMappings(source);
    expect(Object.keys(mappings)).toHaveLength(3);
    expect(mappings.a).toBe('{{ a }}');
    expect(mappings.b).toBe('{{ b }}');
    expect(mappings.c).toBe('{{ c }}');
    expect(cleanedSource).not.toContain('tap(');
  });

  it('preserves other code around tap() calls', () => {
    const source = `
      import { createSignal } from 'solid-js';
      const title = tap('{{ product.title }}', 'Default');
      const [count, setCount] = createSignal(0);
      const price = tap('{{ product.price | money }}', '$0.00');
    `;
    const { cleanedSource, mappings } = extractTapMappings(source);
    expect(cleanedSource).toContain('createSignal');
    expect(cleanedSource).toContain('import');
    expect(Object.keys(mappings)).toHaveLength(2);
  });

  it('produces no warnings for valid tap() calls', () => {
    const source = `const title = tap('{{ product.title }}', 'Default');`;
    const { warnings } = extractTapMappings(source);
    expect(warnings).toHaveLength(0);
  });

  it('handles tap() with a complex fallback expression', () => {
    const source = `const price = tap('{{ product.price | money }}', props.price ?? '$0.00');`;
    const { mappings, cleanedSource } = extractTapMappings(source);
    expect(mappings.price).toBe('{{ product.price | money }}');
    expect(cleanedSource).toContain("props.price ?? '$0.00'");
  });

  // -------------------------------------------------------------------------
  // TypeScript type assertion unwrapping
  // -------------------------------------------------------------------------

  it('handles tap() as T — strips the cast and still extracts the mapping', () => {
    const source = `
      interface Opt { name: string; values: string[]; }
      const options = tap('{{ product.options_with_values }}', props.options ?? []) as Opt[];
    `;
    const { mappings, cleanedSource } = extractTapMappings(source);
    expect(mappings.options).toBe('{{ product.options_with_values }}');
    expect(cleanedSource).not.toContain('tap(');
    expect(cleanedSource).not.toContain(' as Opt[]');
    expect(cleanedSource).toContain('props.options ?? []');
  });

  it('handles tap()! — strips the non-null assertion', () => {
    const source = `const variantId = tap('{{ product.selected_or_first_available_variant.id }}', props.id ?? 0)!;`;
    const { mappings, cleanedSource } = extractTapMappings(source);
    expect(mappings.variantId).toBe('{{ product.selected_or_first_available_variant.id }}');
    expect(cleanedSource).not.toContain('tap(');
    expect(cleanedSource).not.toContain('!');
    expect(cleanedSource).toContain('props.id ?? 0');
  });

  it('handles tap() satisfies T — strips the satisfies assertion', () => {
    const source = `const available = tap('{{ product.available }}', props.available ?? true) satisfies boolean;`;
    const { mappings, cleanedSource } = extractTapMappings(source);
    expect(mappings.available).toBe('{{ product.available }}');
    expect(cleanedSource).not.toContain('tap(');
    expect(cleanedSource).not.toContain('satisfies');
    expect(cleanedSource).toContain('props.available ?? true');
  });

  it('handles multiple chained assertions: tap() as T as U', () => {
    const source = `const x = tap('{{ product.title }}', 'default') as unknown as string;`;
    const { mappings, cleanedSource } = extractTapMappings(source);
    expect(mappings.x).toBe('{{ product.title }}');
    expect(cleanedSource).not.toContain('tap(');
    expect(cleanedSource).toContain("'default'");
  });

  // -------------------------------------------------------------------------
  // tapWhen() — reactive tap
  // -------------------------------------------------------------------------

  it('extracts tapWhen() mapping into mappings (same as tap)', () => {
    const source = `
      const price = tapWhen('{{ product.price | money }}', [variantId], props.price ?? '$0.00');
    `;
    const { mappings } = extractTapMappings(source);
    expect(mappings.price).toBe('{{ product.price | money }}');
  });

  it('adds tapWhen variable to reactiveVars', () => {
    const source = `
      const price    = tapWhen('{{ product.price | money }}', [variantId], props.price ?? '$0.00');
      const title    = tap('{{ product.title }}', props.title ?? 'Product');
    `;
    const { reactiveVars } = extractTapMappings(source);
    expect(reactiveVars.has('price')).toBe(true);
    expect(reactiveVars.has('title')).toBe(false);
  });

  it('replaces tapWhen() with createTapSignal(key, deps, fallback) in cleanedSource', () => {
    const source = `const price = tapWhen('{{ product.price | money }}', [variantId], props.price ?? '$0.00');`;
    const { cleanedSource } = extractTapMappings(source);
    expect(cleanedSource).not.toContain('tapWhen(');
    expect(cleanedSource).toContain('createTapSignal("price", [variantId], props.price ??');
  });

  it('prepends createTapSignal import when tapWhen is present', () => {
    const source = `const price = tapWhen('{{ product.price | money }}', [variantId], '$0.00');`;
    const { cleanedSource } = extractTapMappings(source);
    expect(cleanedSource).toContain("import { createTapSignal } from '$lib/runtime'");
  });

  it('does not prepend createTapSignal import when only tap() is used', () => {
    const source = `const price = tap('{{ product.price | money }}', '$0.00');`;
    const { cleanedSource } = extractTapMappings(source);
    expect(cleanedSource).not.toContain('createTapSignal');
  });

  it('handles multiple tapWhen() calls — each gets its own key', () => {
    const source = `
      const price     = tapWhen('{{ product.price | money }}',  [v], '$0.00');
      const available = tapWhen('{{ product.available }}',       [v], true);
    `;
    const { mappings, reactiveVars, cleanedSource } = extractTapMappings(source);
    expect(mappings.price).toBe('{{ product.price | money }}');
    expect(mappings.available).toBe('{{ product.available }}');
    expect(reactiveVars.has('price')).toBe(true);
    expect(reactiveVars.has('available')).toBe(true);
    expect(cleanedSource).toContain('createTapSignal("price"');
    expect(cleanedSource).toContain('createTapSignal("available"');
  });

  it('handles tapWhen() as T — strips the type assertion', () => {
    const source = `const opts = tapWhen('{{ product.options_with_values }}', [v], []) as Opt[];`;
    const { mappings, reactiveVars } = extractTapMappings(source);
    expect(mappings.opts).toBe('{{ product.options_with_values }}');
    expect(reactiveVars.has('opts')).toBe(true);
  });

  it('mixes tap() and tapWhen() in the same component', () => {
    const source = `
      const title     = tap('{{ product.title }}', 'Product');
      const price     = tapWhen('{{ product.price | money }}', [variantId], '$0.00');
      const available = tapWhen('{{ product.available }}', [variantId], true);
    `;
    const { mappings, reactiveVars, cleanedSource } = extractTapMappings(source);
    expect(Object.keys(mappings)).toHaveLength(3);
    expect(reactiveVars.size).toBe(2);
    // tap() → plain fallback; tapWhen() → createTapSignal()
    expect(cleanedSource).toContain("'Product'");
    expect(cleanedSource).toContain('createTapSignal("price"');
    expect(cleanedSource).toContain('createTapSignal("available"');
    expect(cleanedSource).not.toContain('tapWhen(');
    expect(cleanedSource).not.toContain("tap('");
  });

  // -------------------------------------------------------------------------
  // tapPersonalized() — external server personalization
  // -------------------------------------------------------------------------

  it('detects tapPersonalized() and replaces with createPersonalizedSignal', () => {
    const source = `const recs = tapPersonalized('/api/recs', { customerId }, []);`;
    const { cleanedSource } = extractTapMappings(source);
    expect(cleanedSource).not.toContain('tapPersonalized(');
    expect(cleanedSource).toContain('createPersonalizedSignal("/api/recs", { customerId }, [])');
  });

  it('prepends createPersonalizedSignal import when tapPersonalized is present', () => {
    const source = `const recs = tapPersonalized('/api/recs', { customerId }, []);`;
    const { cleanedSource } = extractTapMappings(source);
    expect(cleanedSource).toContain("import { createPersonalizedSignal } from '$lib/runtime'");
  });

  it('extracts personalizedCalls with URL and params (shorthand)', () => {
    const source = `const recs = tapPersonalized('/api/recs', { customerId, tags }, []);`;
    const { personalizedCalls } = extractTapMappings(source);
    expect(personalizedCalls).toHaveLength(1);
    expect(personalizedCalls[0].varName).toBe('recs');
    expect(personalizedCalls[0].url).toBe('/api/recs');
    expect(personalizedCalls[0].params).toEqual({ customerId: 'customerId', tags: 'tags' });
  });

  it('extracts personalizedCalls with explicit key:value params', () => {
    const source = `const recs = tapPersonalized('/api/recs', { id: customerId }, []);`;
    const { personalizedCalls } = extractTapMappings(source);
    expect(personalizedCalls).toHaveLength(1);
    expect(personalizedCalls[0].params).toEqual({ id: 'customerId' });
  });

  it('works alongside tap() and tapWhen() in same file', () => {
    const source = `
      const title = tap('{{ product.title }}', 'Product');
      const price = tapWhen('{{ product.price | money }}', [v], '$0.00');
      const recs = tapPersonalized('/api/recs', { customerId }, []);
    `;
    const { mappings, reactiveVars, personalizedCalls, cleanedSource } = extractTapMappings(source);
    expect(Object.keys(mappings)).toHaveLength(2); // title + price (not recs)
    expect(reactiveVars.size).toBe(1); // price
    expect(personalizedCalls).toHaveLength(1); // recs
    expect(cleanedSource).toContain("'Product'");
    expect(cleanedSource).toContain('createTapSignal("price"');
    expect(cleanedSource).toContain('createPersonalizedSignal("/api/recs"');
  });

  it('strips type assertions from tapPersonalized()', () => {
    const source = `const recs = tapPersonalized('/api/recs', { customerId }, []) as Rec[];`;
    const { personalizedCalls, cleanedSource } = extractTapMappings(source);
    expect(personalizedCalls).toHaveLength(1);
    expect(cleanedSource).not.toContain('as Rec[]');
    expect(cleanedSource).toContain('createPersonalizedSignal');
  });

  it('returns empty personalizedCalls when none present', () => {
    const source = `const title = tap('{{ product.title }}', 'Default');`;
    const { personalizedCalls } = extractTapMappings(source);
    expect(personalizedCalls).toHaveLength(0);
  });

  it('does not add tapPersonalized vars to mappings', () => {
    const source = `const recs = tapPersonalized('/api/recs', { customerId }, []);`;
    const { mappings } = extractTapMappings(source);
    expect(mappings.recs).toBeUndefined();
  });

  it('handles liquid expressions with filters', () => {
    const filters = [
      `tap('{{ product.price | money }}', '$0')`,
      `tap('{{ product.compare_at_price | money_with_currency }}', '')`,
      `tap('{{ article.excerpt | strip_html | truncate: 120 }}', '')`,
    ];
    for (const expr of filters) {
      const source = `const x = ${expr};`;
      const { mappings, warnings } = extractTapMappings(source);
      expect(Object.keys(mappings)).toHaveLength(1);
      expect(warnings).toHaveLength(0);
    }
  });
});
