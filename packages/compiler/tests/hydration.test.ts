/**
 * hydration.test.ts
 *
 * Tests for Phase 6: hydration entry generation and data-component attrs.
 */

import { describe, it, expect } from 'vitest';
import {
  isInteractiveComponent,
  detectPropVars,
  generateDataProps,
  generateDataSection,
  generateHydrationEntry,
} from '../src/hydration';
import { generateLiquid } from '../src/liquid-gen';
import type { TapMapping } from '../src/tap-extract';

// ---------------------------------------------------------------------------
// isInteractiveComponent()
// ---------------------------------------------------------------------------

describe('isInteractiveComponent()', () => {
  it('returns true for component with createSignal', () => {
    const source = `
      import { createSignal } from 'solid-js';
      export default function Foo() {
        const [count, setCount] = createSignal(0);
        return <div>{count()}</div>;
      }
    `;
    expect(isInteractiveComponent(source)).toBe(true);
  });

  it('returns true for component with createEffect', () => {
    const source = `
      import { createEffect } from 'solid-js';
      export default function Foo() {
        createEffect(() => { console.log('effect'); });
        return <div>hello</div>;
      }
    `;
    expect(isInteractiveComponent(source)).toBe(true);
  });

  it('returns true for component with onClick handler', () => {
    const source = `
      export default function Foo() {
        return <button onClick={() => alert('hi')}>click</button>;
      }
    `;
    expect(isInteractiveComponent(source)).toBe(true);
  });

  it('returns true for component with onChange handler', () => {
    const source = `
      export default function Foo() {
        return <input onChange={(e) => console.log(e)} />;
      }
    `;
    expect(isInteractiveComponent(source)).toBe(true);
  });

  it('returns false for a purely static component', () => {
    const source = `
      export default function Foo() {
        return <div class="card"><h1>Hello</h1></div>;
      }
    `;
    expect(isInteractiveComponent(source)).toBe(false);
  });

  it('returns false for a component with only tap() calls and no events', () => {
    const source = `
      import { tap } from '$lib/runtime';
      export default function Foo() {
        const title = tap('{{ product.title }}', 'Product');
        return <h1>{title}</h1>;
      }
    `;
    expect(isInteractiveComponent(source)).toBe(false);
  });

  it('returns true for a component with tapWhen() calls', () => {
    const source = `
      import { tapWhen } from '$lib/runtime';
      export default function Foo(props) {
        const price = tapWhen('{{ product.price | money }}', [variantId], props.price ?? '$0.00');
        return <span>{price()}</span>;
      }
    `;
    expect(isInteractiveComponent(source)).toBe(true);
  });

  it('returns true for a component with tapPersonalized() calls', () => {
    const source = `
      import { tapPersonalized } from '$lib/runtime';
      export default function Foo(props) {
        const recs = tapPersonalized('/api/recs', { customerId }, []);
        return <div>{recs()}</div>;
      }
    `;
    expect(isInteractiveComponent(source)).toBe(true);
  });

  it('returns true for a component with tapRemote() calls', () => {
    const source = `
      import { tapRemote } from '$lib/runtime';
      import ProductCard from '$snippets/ProductCard';
      export default function Foo() {
        const html = tapRemote(ProductCard, '/products/x');
        return <div innerHTML={html()}></div>;
      }
    `;
    expect(isInteractiveComponent(source)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// detectPropVars()
// ---------------------------------------------------------------------------

describe('detectPropVars()', () => {
  const mappings: TapMapping = {
    handle: '{{ product.handle }}',
    title: '{{ product.title }}',
    price: '{{ product.price | money }}',
    available: '{{ product.available }}',
  };

  it('returns vars referenced inside a named onClick function body', () => {
    const source = `
      export default function ProductCard() {
        const handle = tap('{{ product.handle }}', '');
        const title = tap('{{ product.title }}', 'Product');

        async function addToCart() {
          await fetch('/cart/add.js', {
            body: JSON.stringify({ items: [{ id: handle, quantity: 1 }] }),
          });
        }

        return <button onClick={addToCart}>{title}</button>;
      }
    `;
    const vars = detectPropVars(source, mappings);
    expect(vars).toContain('handle');
    // title is only in JSX render, not in the event handler body
    expect(vars).not.toContain('title');
  });

  it('returns vars referenced in an inline arrow function handler', () => {
    const source = `
      export default function Foo() {
        const handle = tap('{{ product.handle }}', '');
        return <button onClick={() => console.log(handle)}>click</button>;
      }
    `;
    const vars = detectPropVars(source, mappings);
    expect(vars).toContain('handle');
  });

  it('returns empty array when there are no on* handlers', () => {
    const source = `
      export default function Foo() {
        const title = tap('{{ product.title }}', 'Product');
        return <h1>{title}</h1>;
      }
    `;
    const vars = detectPropVars(source, mappings);
    expect(vars).toEqual([]);
  });

  it('ignores vars that only appear in JSX render expressions', () => {
    const source = `
      export default function Foo() {
        const title = tap('{{ product.title }}', 'Product');
        const price = tap('{{ product.price | money }}', '$0.00');

        function handleClick() {
          window.alert('clicked');
        }

        return <div onClick={handleClick}><h1>{title}</h1><span>{price}</span></div>;
      }
    `;
    const vars = detectPropVars(source, mappings);
    // handleClick doesn't reference any mappings
    expect(vars).toEqual([]);
  });

  it('returns multiple vars when handler uses several mappings', () => {
    const source = `
      export default function Foo() {
        const handle = tap('{{ product.handle }}', '');
        const available = tap('{{ product.available }}', true);

        function handleClick() {
          if (available) {
            fetch('/cart/add.js?id=' + handle);
          }
        }

        return <button onClick={handleClick}>Add</button>;
      }
    `;
    const vars = detectPropVars(source, mappings);
    expect(vars).toContain('handle');
    expect(vars).toContain('available');
  });
});

// ---------------------------------------------------------------------------
// generateDataProps()
// ---------------------------------------------------------------------------

describe('generateDataProps()', () => {
  const mappings: TapMapping = {
    handle: '{{ product.handle }}',
    price: '{{ product.price | money }}',
    available: '{{ product.available }}',
  };

  it('returns {} for empty propVars', () => {
    expect(generateDataProps([], mappings)).toBe('{}');
  });

  it('generates the correct format for a single prop', () => {
    const result = generateDataProps(['handle'], mappings);
    expect(result).toBe('{ "handle": {{ product.handle | json }} }');
  });

  it('generates the correct format for multiple props', () => {
    const result = generateDataProps(['handle', 'available'], mappings);
    expect(result).toBe(
      '{ "handle": {{ product.handle | json }}, "available": {{ product.available | json }} }',
    );
  });

  it('appends | json to bare liquid expressions', () => {
    const result = generateDataProps(['handle'], mappings);
    expect(result).toContain('| json');
  });

  it('handles expressions that already have filters by appending | json', () => {
    const result = generateDataProps(['price'], mappings);
    expect(result).toBe('{ "price": {{ product.price | money | json }} }');
  });
});

// ---------------------------------------------------------------------------
// generateDataSection()
// ---------------------------------------------------------------------------

describe('generateDataSection()', () => {
  const mappings: TapMapping = {
    price: '{{ product.price | money }}',
    available: '{{ product.available }}',
    variantId: '{{ product.selected_or_first_available_variant.id }}',
  };

  it('outputs a <script type="application/json"> tag', () => {
    const result = generateDataSection(['price'], mappings);
    expect(result).toContain('<script type="application/json">');
    expect(result).toContain('</script>');
  });

  it('emits each variable with | json filter', () => {
    const result = generateDataSection(['price', 'available'], mappings);
    expect(result).toContain('"price": {{ product.price | money | json }}');
    expect(result).toContain('"available": {{ product.available | json }}');
  });

  it('produces valid JSON structure (no trailing comma)', () => {
    const result = generateDataSection(['price', 'available'], mappings);
    // The last entry must not be followed by a comma before the closing brace
    expect(result).not.toMatch(/"available":[^}]*,\s*\}/);
  });

  it('handles a single variable', () => {
    const result = generateDataSection(['variantId'], mappings);
    expect(result).toContain(
      '"variantId": {{ product.selected_or_first_available_variant.id | json }}',
    );
  });
});

// ---------------------------------------------------------------------------
// generateHydrationEntry()
// ---------------------------------------------------------------------------

describe('generateHydrationEntry()', () => {
  it('returns an empty comment for no components', () => {
    const result = generateHydrationEntry([]);
    expect(result).toContain('No interactive components');
  });

  it('includes an import from solid-js/web', () => {
    const result = generateHydrationEntry([
      { name: 'ProductCard', importPath: './product-card.js' },
    ]);
    expect(result).toContain("import { render } from 'solid-js/web'");
  });

  it('registers each component in the registry', () => {
    const result = generateHydrationEntry([
      { name: 'ProductCard', importPath: './product-card.js' },
      { name: 'ImageGallery', importPath: './image-gallery.js' },
    ]);
    expect(result).toContain("'ProductCard': () => import('./product-card.js')");
    expect(result).toContain("'ImageGallery': () => import('./image-gallery.js')");
  });

  it('includes the mount loop logic', () => {
    const result = generateHydrationEntry([
      { name: 'ProductCard', importPath: './product-card.js' },
    ]);
    expect(result).toContain('querySelectorAll');
    expect(result).toContain('data-component');
    expect(result).toContain('data-props');
    expect(result).toContain('render');
  });
});

// ---------------------------------------------------------------------------
// Integration: data-component / data-props in generated liquid
// ---------------------------------------------------------------------------

describe('integration: hydration attrs in generated liquid', () => {
  const source = `
    import { createSignal } from 'solid-js';
    import { tap } from '$lib/runtime';
    export default function ProductCard() {
      const handle = tap('{{ product.handle }}', '');
      const title = tap('{{ product.title }}', 'Product');
      const [adding, setAdding] = createSignal(false);
      async function addToCart() {
        await fetch('/cart/add.js?id=' + handle);
        setAdding(false);
      }
      return (
        <div class="product-card">
          <h1>{title}</h1>
          <button onClick={addToCart}>Add</button>
        </div>
      );
    }
  `;

  const mappings: TapMapping = {
    handle: '{{ product.handle }}',
    title: '{{ product.title }}',
  };

  it('adds data-component to the root element when dataProps is set', () => {
    const liquid = generateLiquid(source, mappings, {
      componentName: 'ProductCard',
      dataProps: '{ "handle": {{ product.handle | json }} }',
    });
    expect(liquid).toContain('data-component="ProductCard"');
  });

  it('adds data-props with the Liquid expression to the root element', () => {
    const liquid = generateLiquid(source, mappings, {
      componentName: 'ProductCard',
      dataProps: '{ "handle": {{ product.handle | json }} }',
    });
    expect(liquid).toContain(`data-props='{ "handle": {{ product.handle | json }} }'`);
  });

  it('uses single quotes for the data-props attribute value', () => {
    const liquid = generateLiquid(source, mappings, {
      componentName: 'ProductCard',
      dataProps: '{ "handle": {{ product.handle | json }} }',
    });
    // Single-quoted because the value contains double-quoted JSON keys
    expect(liquid).toMatch(/data-props='[^']*'/);
  });

  it('does not add hydration attrs when dataProps is not provided', () => {
    const liquid = generateLiquid(source, mappings, {
      componentName: 'ProductCard',
    });
    expect(liquid).not.toContain('data-component');
    expect(liquid).not.toContain('data-props');
  });

  it('adds data-section-id when dataSectionId is provided', () => {
    const liquid = generateLiquid(source, mappings, {
      componentName: 'ProductCard',
      dataProps: '{}',
      dataSectionId: 'product-card-data',
    });
    expect(liquid).toContain('data-section-id="product-card-data"');
  });

  it('does not add data-section-id when dataSectionId is not provided', () => {
    const liquid = generateLiquid(source, mappings, {
      componentName: 'ProductCard',
      dataProps: '{}',
    });
    expect(liquid).not.toContain('data-section-id');
  });

  it('only annotates the root element, not nested elements', () => {
    const liquid = generateLiquid(source, mappings, {
      componentName: 'ProductCard',
      dataProps: '{}',
    });
    const occurrences = (liquid.match(/data-component/g) ?? []).length;
    expect(occurrences).toBe(1);
  });
});
