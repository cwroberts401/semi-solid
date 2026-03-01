/**
 * render-tag.test.ts
 *
 * Tests for Phase 3: JSX component elements → Liquid {% render %} tags,
 * and props.children → {{ content_for_layout }}.
 */

import { describe, it, expect } from 'vitest';
import { extractTapMappings } from '../src/tap-extract';
import { generateLiquid } from '../src/liquid-gen';

function compile(source: string, componentName = 'TestComponent') {
  const { mappings } = extractTapMappings(source, `${componentName}.tsx`);
  return generateLiquid(source, mappings, { componentName });
}

describe('component element → {% render %}', () => {
  it('renders a component with no props as a plain render tag', () => {
    const source = `
      function Page() {
        return (
          <div class="page">
            <ProductCard />
          </div>
        );
      }
    `;
    const output = compile(source);
    expect(output).toContain("{% render 'product-card' %}");
  });

  it('converts PascalCase component name to kebab-case snippet name', () => {
    const source = `
      function Page() {
        return (
          <div>
            <CartDrawer />
            <VariantPicker />
          </div>
        );
      }
    `;
    const output = compile(source);
    expect(output).toContain("{% render 'cart-drawer' %}");
    expect(output).toContain("{% render 'variant-picker' %}");
  });

  it('passes tap-mapped prop as a render tag variable', () => {
    const source = `
      function Page() {
        const price = tap('{{ product.price | money }}', '');
        return (
          <div>
            <PriceDisplay price={price} />
          </div>
        );
      }
    `;
    const output = compile(source);
    // price is passed as an explicit prop; product is also passed so the
    // snippet can access other product.* fields (Shopify render tag isolation).
    expect(output).toContain('price: product.price | money');
    expect(output).toContain('product: product');
  });

  it('passes multiple tap-mapped props to render tag', () => {
    const source = `
      function Page() {
        const price = tap('{{ product.price | money }}', '');
        const comparePrice = tap('{{ product.compare_at_price | money }}', '');
        return (
          <div>
            <PriceDisplay price={price} comparePrice={comparePrice} />
          </div>
        );
      }
    `;
    const output = compile(source);
    expect(output).toContain('price: product.price | money');
    expect(output).toContain('comparePrice: product.compare_at_price | money');
    expect(output).toContain('product: product');
  });

  it('omits event handler props from render tag', () => {
    const source = `
      function Page() {
        const title = tap('{{ product.title }}', '');
        return (
          <div>
            <ProductCard title={title} onClick={handleClick} onHover={doSomething} />
          </div>
        );
      }
    `;
    const output = compile(source);
    expect(output).toContain('title: product.title');
    expect(output).toContain('product: product');
    expect(output).not.toContain('onClick');
    expect(output).not.toContain('onHover');
  });

  it('omits non-tap-mapped (client-side) props from render tag', () => {
    const source = `
      function Page() {
        const [isOpen] = createSignal(false);
        return (
          <div>
            <Modal isOpen={isOpen()} />
          </div>
        );
      }
    `;
    const output = compile(source);
    expect(output).toContain("{% render 'modal' %}");
    expect(output).not.toContain('isOpen');
  });

  it('renders multiple component imports in the correct order', () => {
    const source = `
      function Page() {
        return (
          <div>
            <Header />
            <ProductCard />
            <Footer />
          </div>
        );
      }
    `;
    const output = compile(source);
    expect(output).toContain("{% render 'header' %}");
    expect(output).toContain("{% render 'product-card' %}");
    expect(output).toContain("{% render 'footer' %}");
    // Check order
    const headerIdx = output.indexOf("{% render 'header' %}");
    const cardIdx = output.indexOf("{% render 'product-card' %}");
    const footerIdx = output.indexOf("{% render 'footer' %}");
    expect(headerIdx).toBeLessThan(cardIdx);
    expect(cardIdx).toBeLessThan(footerIdx);
  });

  it('renders a component nested inside a Show block', () => {
    const source = `
      function Page() {
        const available = tap('{{ product.available }}', true);
        return (
          <div>
            <Show when={available}>
              <AddToCart />
            </Show>
          </div>
        );
      }
    `;
    const output = compile(source);
    expect(output).toContain('{% if product.available %}');
    expect(output).toContain("{% render 'add-to-cart', product: product %}");
    expect(output).toContain('{% endif %}');
  });
});

describe('props.children → {{ content_for_layout }}', () => {
  it('renders props.children as content_for_layout', () => {
    const source = `
      function Layout(props) {
        return (
          <div class="layout">
            {props.children}
          </div>
        );
      }
    `;
    const output = compile(source);
    expect(output).toContain('{{ content_for_layout }}');
  });

  it('renders props.children alongside other content', () => {
    const source = `
      function Layout(props) {
        const shopName = tap('{{ shop.name }}', 'Store');
        return (
          <div>
            <header>{shopName}</header>
            <main>{props.children}</main>
            <footer>{shopName}</footer>
          </div>
        );
      }
    `;
    const output = compile(source);
    expect(output).toContain('<main>{{ content_for_layout }}</main>');
    expect(output).toContain('{{ shop.name }}');
  });
});

describe('route file integration', () => {
  it('compiles a full route file with component imports to a template', () => {
    const source = `
      function ProductPage() {
        return (
          <div class="page-product">
            <ProductCard />
          </div>
        );
      }
    `;
    const output = compile(source, '[handle]');
    expect(output).toContain('<div class="page-product">');
    expect(output).toContain("{% render 'product-card' %}");
    expect(output).toContain('</div>');
  });

  it('compiles a layout file with props.children to theme.liquid structure', () => {
    const source = `
      function Layout(props) {
        const shopName = tap('{{ shop.name }}', 'My Store');
        return (
          <html>
            <body>
              <header class="site-header">
                <a href="/">{shopName}</a>
              </header>
              <main class="site-main">
                {props.children}
              </main>
            </body>
          </html>
        );
      }
    `;
    const output = compile(source, '+layout');
    expect(output).toContain('{{ shop.name }}');
    expect(output).toContain('{{ content_for_layout }}');
    expect(output).toContain('<main class="site-main">');
  });
});
