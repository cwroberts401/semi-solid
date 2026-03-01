import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import {
  resolveShowCondition,
  resolveForIteration,
  resolveMemberPath,
  stripLiquidBraces,
} from '../src/control-flow';

// ---------------------------------------------------------------------------
// Helpers: parse a small expression and extract AST nodes
// ---------------------------------------------------------------------------

/** Parse `const x = <expr>` and return the init (right-hand side) AST node. */
function parseExpr(src: string) {
  const { program } = parseSync('test.ts', `const __x = ${src};`);
  return (program.body[0] as any).declarations[0].init;
}

/** Parse a JSX attribute value expression: `<Foo when={<expr>} />` */
function parseAttrExpr(attrSrc: string) {
  const { program } = parseSync(
    'test.tsx',
    `const __x = <Foo when={${attrSrc}} />;`,
  );
  const jsxEl = (program.body[0] as any).declarations[0].init;
  const attr = jsxEl.openingElement.attributes[0];
  return attr.value.expression;
}

// ---------------------------------------------------------------------------
// stripLiquidBraces
// ---------------------------------------------------------------------------

describe('stripLiquidBraces()', () => {
  it('strips {{ }} from a full liquid output expression', () => {
    expect(stripLiquidBraces('{{ product.available }}')).toBe('product.available');
    expect(stripLiquidBraces('{{ product.price | money }}')).toBe('product.price | money');
  });

  it('returns plain references unchanged', () => {
    expect(stripLiquidBraces('product.images')).toBe('product.images');
    expect(stripLiquidBraces('cart')).toBe('cart');
  });

  it('trims whitespace from the inner expression', () => {
    expect(stripLiquidBraces('{{  product.title  }}')).toBe('product.title');
  });

  it('leaves {% tag %} expressions unchanged', () => {
    expect(stripLiquidBraces('{% raw %}')).toBe('{% raw %}');
  });
});

// ---------------------------------------------------------------------------
// resolveShowCondition
// ---------------------------------------------------------------------------

describe('resolveShowCondition()', () => {
  const mappings = {
    available: '{{ product.available }}',
    inStock: '{{ variant.available }}',
  };
  const loopVars = new Set<string>();

  it('resolves a tap-mapped identifier', () => {
    const node = parseAttrExpr('available');
    const result = resolveShowCondition(node, mappings, loopVars);
    expect(result).toEqual({ liquidExpr: 'product.available', negated: false });
  });

  it('resolves a negated tap-mapped identifier', () => {
    const node = parseAttrExpr('!available');
    const result = resolveShowCondition(node, mappings, loopVars);
    expect(result).toEqual({ liquidExpr: 'product.available', negated: true });
  });

  it('resolves double negation back to positive', () => {
    const node = parseAttrExpr('!!available');
    const result = resolveShowCondition(node, mappings, loopVars);
    expect(result).toEqual({ liquidExpr: 'product.available', negated: false });
  });

  it('resolves a loop variable identifier', () => {
    const vars = new Set(['item']);
    const node = parseAttrExpr('item');
    const result = resolveShowCondition(node, mappings, vars);
    expect(result).toEqual({ liquidExpr: 'item', negated: false });
  });

  it('resolves a loop variable member expression: item.available', () => {
    const vars = new Set(['item']);
    const node = parseAttrExpr('item.available');
    const result = resolveShowCondition(node, mappings, vars);
    expect(result).toEqual({ liquidExpr: 'item.available', negated: false });
  });

  it('resolves negated loop variable member: !item.available', () => {
    const vars = new Set(['item']);
    const node = parseAttrExpr('!item.available');
    const result = resolveShowCondition(node, mappings, vars);
    expect(result).toEqual({ liquidExpr: 'item.available', negated: true });
  });

  it('returns null for a signal call (client-side)', () => {
    const node = parseAttrExpr('adding()');
    expect(resolveShowCondition(node, mappings, loopVars)).toBeNull();
  });

  it('returns null for a literal (client-side)', () => {
    const node = parseAttrExpr('true');
    expect(resolveShowCondition(node, mappings, loopVars)).toBeNull();
  });

  it('returns null for an unmapped identifier', () => {
    const node = parseAttrExpr('someRandomVar');
    expect(resolveShowCondition(node, mappings, loopVars)).toBeNull();
  });

  it('returns null for a complex logical expression', () => {
    const node = parseAttrExpr('available && inStock');
    expect(resolveShowCondition(node, mappings, loopVars)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveForIteration
// ---------------------------------------------------------------------------

describe('resolveForIteration()', () => {
  const mappings = {
    images: '{{ product.images }}',
    variants: 'product.variants', // plain reference (no braces)
  };

  it('resolves a tap-mapped collection with {{ }}', () => {
    const node = parseAttrExpr('images');
    const result = resolveForIteration(node, 'image', mappings);
    expect(result).toEqual({ collection: 'product.images', loopVar: 'image' });
  });

  it('resolves a tap-mapped collection without {{ }}', () => {
    const node = parseAttrExpr('variants');
    const result = resolveForIteration(node, 'variant', mappings);
    expect(result).toEqual({ collection: 'product.variants', loopVar: 'variant' });
  });

  it('returns null for an unmapped collection', () => {
    const node = parseAttrExpr('localArray');
    expect(resolveForIteration(node, 'item', mappings)).toBeNull();
  });

  it('returns null for a non-identifier expression', () => {
    const node = parseAttrExpr('items.filter(x => x)');
    expect(resolveForIteration(node, 'item', mappings)).toBeNull();
  });

  it('resolves a member expression on a loop variable: link.links', () => {
    const loopVars = new Set(['link']);
    const node = parseAttrExpr('link.links');
    const result = resolveForIteration(node, 'child', mappings, loopVars);
    expect(result).toEqual({ collection: 'link.links', loopVar: 'child' });
  });

  it('returns null for member expression on unknown root', () => {
    const loopVars = new Set<string>();
    const node = parseAttrExpr('unknown.items');
    expect(resolveForIteration(node, 'item', mappings, loopVars)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveMemberPath
// ---------------------------------------------------------------------------

describe('resolveMemberPath()', () => {
  const mappings = { product: 'product' };
  const loopVars = new Set(['image', 'item']);

  it('resolves a loop variable identifier', () => {
    const node = parseAttrExpr('image');
    expect(resolveMemberPath(node, mappings, loopVars)).toBe('image');
  });

  it('resolves a loop variable member access', () => {
    const node = parseAttrExpr('image.url');
    expect(resolveMemberPath(node, mappings, loopVars)).toBe('image.url');
  });

  it('resolves deeply nested member access', () => {
    const node = parseAttrExpr('item.variants.first');
    expect(resolveMemberPath(node, mappings, loopVars)).toBe('item.variants.first');
  });

  it('returns null for a computed access', () => {
    const node = parseExpr('arr[0]');
    expect(resolveMemberPath(node, mappings, loopVars)).toBeNull();
  });

  it('returns null for an unknown root identifier', () => {
    const node = parseAttrExpr('unknown.prop');
    expect(resolveMemberPath(node, mappings, loopVars)).toBeNull();
  });
});
