import { describe, it, expect } from 'vitest';
import { extractTapMappings } from '../src/tap-extract';

describe('tapRemote() extraction', () => {
  it('detects tapRemote() in a variable declaration and replaces with __tapRemoteHtml', () => {
    const source = `
      import { tapRemote } from '$lib/runtime';
      import ProductCard from '$snippets/ProductCard';
      const html = tapRemote(ProductCard, '/products/some-product');
    `;
    const { cleanedSource, remoteComponents } = extractTapMappings(source);
    expect(cleanedSource).toContain('__tapRemoteHtml("remote-product-card", \'/products/some-product\')');
    expect(cleanedSource).not.toContain('tapRemote(');
    expect(remoteComponents.has('ProductCard')).toBe(true);
  });

  it('detects tapRemote() inline in JSX and replaces with __tapRemoteHtml', () => {
    const source = `
      import { tapRemote } from '$lib/runtime';
      import ProductCard from '$snippets/ProductCard';
      export default function Page() {
        return <div>{tapRemote(ProductCard, '/products/x')}</div>;
      }
    `;
    const { cleanedSource, remoteComponents } = extractTapMappings(source);
    expect(cleanedSource).toContain('__tapRemoteHtml("remote-product-card", \'/products/x\')');
    expect(cleanedSource).not.toContain('tapRemote(');
    expect(remoteComponents.has('ProductCard')).toBe(true);
  });

  it('prepends __tapRemoteHtml import when tapRemote is used', () => {
    const source = `
      import { tapRemote } from '$lib/runtime';
      import ProductCard from '$snippets/ProductCard';
      const html = tapRemote(ProductCard, '/products/x');
    `;
    const { cleanedSource } = extractTapMappings(source);
    expect(cleanedSource).toContain("import { __tapRemoteHtml } from '$lib/runtime';");
  });

  it('does NOT prepend __tapRemoteHtml import when only tap() is used', () => {
    const source = `
      import { tap } from '$lib/runtime';
      const title = tap('{{ product.title }}', 'Default');
    `;
    const { cleanedSource } = extractTapMappings(source);
    expect(cleanedSource).not.toContain('__tapRemoteHtml');
  });

  it('handles dynamic URL (template literal variable)', () => {
    const source = `
      import { tapRemote } from '$lib/runtime';
      import ProductCard from '$snippets/ProductCard';
      const url = '/products/' + handle;
      const html = tapRemote(ProductCard, url);
    `;
    const { cleanedSource } = extractTapMappings(source);
    expect(cleanedSource).toContain('__tapRemoteHtml("remote-product-card", url)');
  });

  it('works alongside tap() and tapWhen() in the same file', () => {
    const source = `
      import { tap, tapWhen, tapRemote } from '$lib/runtime';
      import ProductCard from '$snippets/ProductCard';
      const title = tap('{{ product.title }}', 'Default');
      const price = tapWhen('{{ product.price | money }}', [variantId], '$0.00');
      const html = tapRemote(ProductCard, '/products/x');
    `;
    const { mappings, cleanedSource, reactiveVars, remoteComponents } = extractTapMappings(source);
    expect(mappings.title).toBe('{{ product.title }}');
    expect(reactiveVars.has('price')).toBe(true);
    expect(remoteComponents.has('ProductCard')).toBe(true);
    expect(cleanedSource).toContain("import { __tapRemoteHtml } from '$lib/runtime';");
    expect(cleanedSource).toContain("import { createTapSignal } from '$lib/runtime';");
  });

  it('returns empty remoteComponents when no tapRemote() calls exist', () => {
    const source = `
      import { tap } from '$lib/runtime';
      const title = tap('{{ product.title }}', 'Default');
    `;
    const { remoteComponents } = extractTapMappings(source);
    expect(remoteComponents.size).toBe(0);
  });

  it('does not add tapRemote vars to mappings (no liquid expression)', () => {
    const source = `
      import { tapRemote } from '$lib/runtime';
      import ProductCard from '$snippets/ProductCard';
      const html = tapRemote(ProductCard, '/products/x');
    `;
    const { mappings } = extractTapMappings(source);
    expect(Object.keys(mappings)).toHaveLength(0);
  });

  it('handles multiple different tapRemote calls', () => {
    const source = `
      import { tapRemote } from '$lib/runtime';
      import ProductCard from '$snippets/ProductCard';
      import MiniCart from '$snippets/MiniCart';
      const card = tapRemote(ProductCard, '/products/a');
      const cart = tapRemote(MiniCart, '/cart');
    `;
    const { remoteComponents, cleanedSource } = extractTapMappings(source);
    expect(remoteComponents.has('ProductCard')).toBe(true);
    expect(remoteComponents.has('MiniCart')).toBe(true);
    expect(cleanedSource).toContain('__tapRemoteHtml("remote-product-card"');
    expect(cleanedSource).toContain('__tapRemoteHtml("remote-mini-cart"');
  });
});
