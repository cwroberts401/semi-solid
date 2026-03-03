import { describe, it, expect } from 'vitest';
import { extractTapMappings } from '../src/tap-extract';
import { generateLiquid } from '../src/liquid-gen';

// Helper: extract mappings then generate liquid from the same source
function compile(source: string, componentName = 'TestComponent') {
  const { mappings } = extractTapMappings(source, `${componentName}.tsx`);
  return generateLiquid(source, mappings, { componentName });
}

describe('generateLiquid()', () => {
  describe('basic element output', () => {
    it('renders a simple HTML element', () => {
      const source = `
        function Foo() {
          return <div class="wrapper">hello</div>;
        }
      `;
      const output = compile(source);
      expect(output).toContain('<div class="wrapper">');
      expect(output).toContain('hello');
      expect(output).toContain('</div>');
    });

    it('renders self-closing elements', () => {
      const source = `
        function Foo() {
          return <img src="/img.jpg" alt="test" loading="lazy" />;
        }
      `;
      const output = compile(source);
      expect(output).toContain('<img');
      expect(output).toContain('src="/img.jpg"');
      expect(output).toContain('loading="lazy"');
    });

    it('renders nested elements', () => {
      const source = `
        function Foo() {
          return (
            <div>
              <h1>title</h1>
              <p>body</p>
            </div>
          );
        }
      `;
      const output = compile(source);
      expect(output).toContain('<div>');
      expect(output).toContain('<h1>');
      expect(output).toContain('</div>');
    });
  });

  describe('tap() variable → Liquid expression', () => {
    it('replaces {varName} with the liquid expression in text position', () => {
      const source = `
        function Foo() {
          const title = tap('{{ product.title }}', 'Default');
          return <h1>{title}</h1>;
        }
      `;
      const output = compile(source);
      expect(output).toContain('{{ product.title }}');
      expect(output).not.toContain('Default');
    });

    it('replaces {varName} in attribute value', () => {
      const source = `
        function Foo() {
          const imageUrl = tap('{{ product.featured_image | img_url: "600x" }}', '/placeholder.jpg');
          return <img src={imageUrl} alt="product" />;
        }
      `;
      const output = compile(source);
      // Attribute-safe: double quotes inside {{ }} converted to single quotes
      expect(output).toContain("{{ product.featured_image | img_url: '600x' }}");
      expect(output).not.toContain('/placeholder.jpg');
    });

    it('replaces multiple tap()-mapped variables', () => {
      const source = `
        function Foo() {
          const title = tap('{{ product.title }}', 'Default');
          const price = tap('{{ product.price | money }}', '$0.00');
          return (
            <div>
              <h2>{title}</h2>
              <span>{price}</span>
            </div>
          );
        }
      `;
      const output = compile(source);
      expect(output).toContain('{{ product.title }}');
      expect(output).toContain('{{ product.price | money }}');
      expect(output).not.toContain('Default');
      expect(output).not.toContain('$0.00');
    });

    it('handles tap() with liquid filters in attribute', () => {
      const source = `
        function Foo() {
          const title = tap('{{ product.title }}', '');
          return <img alt={title} src="/img.jpg" />;
        }
      `;
      const output = compile(source);
      expect(output).toContain('alt="{{ product.title }}"');
    });
  });

  describe('t() translation calls', () => {
    it('converts t() to {{ "key" | t }}', () => {
      const source = `
        function Foo() {
          return <button>{t('product.add_to_cart')}</button>;
        }
      `;
      const output = compile(source);
      expect(output).toContain("{{ 'product.add_to_cart' | t }}");
    });
  });

  describe('attribute handling', () => {
    it('passes through string literal attributes', () => {
      const source = `
        function Foo() {
          return <div class="product-card" id="main">content</div>;
        }
      `;
      const output = compile(source);
      expect(output).toContain('class="product-card"');
      expect(output).toContain('id="main"');
    });

    it('omits event handler attributes', () => {
      const source = `
        function Foo() {
          return <button onClick={handleClick} class="btn">Click</button>;
        }
      `;
      const output = compile(source);
      expect(output).not.toContain('onClick');
      expect(output).not.toContain('handleClick');
      expect(output).toContain('class="btn"');
    });

    it('omits non-tap-mapped JSX expression attributes', () => {
      const source = `
        function Foo({ active }) {
          return <div class={active ? 'active' : 'inactive'}>content</div>;
        }
      `;
      const output = compile(source);
      // Class is a non-tap expression — should be dropped from liquid output
      expect(output).not.toContain('active');
      expect(output).toContain('<div>');
    });
  });

  describe('component references', () => {
    it('renders component elements as {% render %} tags (Phase 3)', () => {
      const source = `
        function Foo() {
          return (
            <div>
              <PriceDisplay price="$10" />
            </div>
          );
        }
      `;
      const output = compile(source);
      expect(output).toContain("{% render 'price-display' %}");
    });

    it('emits a client-side comment for <Show> with non-tap-mapped condition', () => {
      // `when={true}` is a literal — not tap-mapped — stays client-side
      const source = `
        function Foo() {
          return (
            <div>
              <Show when={true}><span>yes</span></Show>
            </div>
          );
        }
      `;
      const output = compile(source);
      expect(output).toContain('<!-- ');
      expect(output).toContain('client-side');
      expect(output).not.toContain('<span>yes</span>');
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 2: <Show> control flow
  // ---------------------------------------------------------------------------

  describe('<Show> control flow', () => {
    it('renders <Show when={tapMapped}> as {% if %}', () => {
      const source = `
        function Foo() {
          const available = tap('{{ product.available }}', true);
          return (
            <Show when={available}>
              <button>Buy</button>
            </Show>
          );
        }
      `;
      const output = compile(source);
      expect(output).toContain('{% if product.available %}');
      expect(output).toContain('<button>Buy</button>');
      expect(output).toContain('{% endif %}');
      expect(output).not.toContain('{% else %}');
    });

    it('renders <Show when={!tapMapped}> as {% unless %}', () => {
      const source = `
        function Foo() {
          const available = tap('{{ product.available }}', true);
          return (
            <Show when={!available}>
              <span>Sold Out</span>
            </Show>
          );
        }
      `;
      const output = compile(source);
      expect(output).toContain('{% unless product.available %}');
      expect(output).toContain('<span>Sold Out</span>');
      expect(output).toContain('{% endunless %}');
    });

    it('renders <Show> with fallback as {% if %} / {% else %}', () => {
      const source = `
        function Foo() {
          const available = tap('{{ product.available }}', true);
          return (
            <Show when={available} fallback={<span>Sold Out</span>}>
              <button>Buy</button>
            </Show>
          );
        }
      `;
      const output = compile(source);
      expect(output).toContain('{% if product.available %}');
      expect(output).toContain('<button>Buy</button>');
      expect(output).toContain('{% else %}');
      expect(output).toContain('<span>Sold Out</span>');
      expect(output).toContain('{% endif %}');
    });

    it('renders nested <Show> blocks', () => {
      const source = `
        function Foo() {
          const available = tap('{{ product.available }}', true);
          const onSale = tap('{{ product.compare_at_price }}', false);
          return (
            <Show when={available}>
              <Show when={onSale}>
                <span>Sale!</span>
              </Show>
            </Show>
          );
        }
      `;
      const output = compile(source);
      expect(output).toContain('{% if product.available %}');
      expect(output).toContain('{% if product.compare_at_price %}');
      expect(output).toContain('<span>Sale!</span>');
      // Two {% endif %} tags
      expect(output.match(/\{%\s*endif\s*%\}/g)?.length).toBe(2);
    });

    it('emits client-side comment for <Show> with signal condition', () => {
      const source = `
        function Foo() {
          const [open, setOpen] = createSignal(false);
          return <Show when={open()}><div>modal</div></Show>;
        }
      `;
      const output = compile(source);
      expect(output).toContain('client-side');
      expect(output).not.toContain('{% if');
    });

    it('renders fallback with t() inside', () => {
      const source = `
        function Foo() {
          const available = tap('{{ product.available }}', true);
          return (
            <Show when={available} fallback={<span>{t('product.sold_out')}</span>}>
              <button>{t('product.add_to_cart')}</button>
            </Show>
          );
        }
      `;
      const output = compile(source);
      expect(output).toContain("{{ 'product.sold_out' | t }}");
      expect(output).toContain("{{ 'product.add_to_cart' | t }}");
      expect(output).toContain('{% else %}');
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 2: <For> control flow
  // ---------------------------------------------------------------------------

  describe('<For> control flow', () => {
    it('renders <For each={tapMapped}> as {% for %}', () => {
      const source = `
        function Foo() {
          const images = tap('product.images', []);
          return (
            <For each={images}>
              {(image) => <img src={image} />}
            </For>
          );
        }
      `;
      const output = compile(source);
      expect(output).toContain('{% for image in product.images %}');
      expect(output).toContain('<img');
      expect(output).toContain('{% endfor %}');
    });

    it('renders loop variable in text position', () => {
      const source = `
        function Foo() {
          const tags = tap('product.tags', []);
          return (
            <For each={tags}>
              {(tag) => <span>{tag}</span>}
            </For>
          );
        }
      `;
      const output = compile(source);
      expect(output).toContain('{% for tag in product.tags %}');
      expect(output).toContain('<span>{{ tag }}</span>');
    });

    it('renders loop variable member access', () => {
      const source = `
        function Foo() {
          const images = tap('product.images', []);
          return (
            <For each={images}>
              {(image) => <img src={image.src} alt={image.alt} />}
            </For>
          );
        }
      `;
      const output = compile(source);
      expect(output).toContain('src="{{ image.src }}"');
      expect(output).toContain('alt="{{ image.alt }}"');
    });

    it('renders loop variable in attribute value', () => {
      const source = `
        function Foo() {
          const images = tap('product.images', []);
          return (
            <For each={images}>
              {(image) => <img src={image} />}
            </For>
          );
        }
      `;
      const output = compile(source);
      expect(output).toContain('src="{{ image }}"');
    });

    it('emits client-side comment for non-tap-mapped collection', () => {
      const source = `
        function Foo() {
          const localItems = [1, 2, 3];
          return (
            <For each={localItems}>
              {(item) => <span>{item}</span>}
            </For>
          );
        }
      `;
      const output = compile(source);
      expect(output).toContain('client-side');
      expect(output).not.toContain('{% for');
    });

    it('renders <Show> inside <For> with loop variable condition', () => {
      const source = `
        function Foo() {
          const images = tap('product.images', []);
          return (
            <For each={images}>
              {(image) => (
                <Show when={image.available}>
                  <img src={image.src} />
                </Show>
              )}
            </For>
          );
        }
      `;
      const output = compile(source);
      expect(output).toContain('{% for image in product.images %}');
      expect(output).toContain('{% if image.available %}');
      expect(output).toContain('src="{{ image.src }}"');
      expect(output).toContain('{% endif %}');
      expect(output).toContain('{% endfor %}');
    });

    it('handles tap() with {{ }} notation for collections', () => {
      const source = `
        function Foo() {
          const variants = tap('{{ product.variants }}', []);
          return (
            <For each={variants}>
              {(variant) => <option value={variant.id}>{variant.title}</option>}
            </For>
          );
        }
      `;
      const output = compile(source);
      // {{ }} notation is stripped to get the collection path
      expect(output).toContain('{% for variant in product.variants %}');
      expect(output).toContain('{{ variant.title }}');
    });

    it('renders nested <For> loops — outer loop var as inner collection', () => {
      const source = `
        function Foo() {
          const links = tap('linklists.main-menu.links', []);
          return (
            <For each={links}>
              {(link) => (
                <div>
                  <a href={link.url}>{link.title}</a>
                  <For each={link.links}>
                    {(child) => (
                      <a href={child.url}>{child.title}</a>
                    )}
                  </For>
                </div>
              )}
            </For>
          );
        }
      `;
      const output = compile(source);
      expect(output).toContain('{% for link in linklists.main-menu.links %}');
      expect(output).toContain('{% for child in link.links %}');
      expect(output).toContain('{{ link.url }}');
      expect(output).toContain('{{ link.title }}');
      expect(output).toContain('{{ child.url }}');
      expect(output).toContain('{{ child.title }}');
      expect(output).toContain('{% endfor %}');
      // Two endfor tags (outer + inner)
      expect(output.match(/\{%\s*endfor\s*%\}/g)?.length).toBe(2);
    });

    it('renders MiniCart pattern: tap item_count in button, signal Show as client-side', () => {
      const source = `
        function MiniCart() {
          const itemCount = tap('{{ cart.item_count }}', 0);
          const [isOpen, setIsOpen] = createSignal(false);
          return (
            <div class="relative">
              <button onClick={openCart}>
                <span>{itemCount}</span>
              </button>
              <Show when={isOpen()}>
                <div class="drawer">drawer content</div>
              </Show>
            </div>
          );
        }
      `;
      const output = compile(source, 'MiniCart');
      expect(output).toContain('{{ cart.item_count }}');
      expect(output).toContain('client-side');
      expect(output).not.toContain('drawer content');
      expect(output).not.toContain('{% if');
    });
  });

  describe('output formatting', () => {
    it('trims the output and ends with a newline', () => {
      const source = `
        function Foo() {
          return <div>test</div>;
        }
      `;
      const output = compile(source);
      expect(output).not.toMatch(/^\s/);
      expect(output).toMatch(/\n$/);
    });
  });

  describe('liquidRaw()', () => {
    it('passes Liquid output tags through unchanged', () => {
      const source = `
        function Foo() {
          return (
            <div>
              {liquidRaw('{{ content_for_header }}')}
            </div>
          );
        }
      `;
      const output = compile(source);
      expect(output).toContain('{{ content_for_header }}');
      // Must not be double-wrapped: {{ {{ ... }} }}
      expect(output).not.toContain('{{ {{ content_for_header }}');
    });

    it('passes Liquid block tags through unchanged', () => {
      const source = `
        function Foo() {
          return (
            <head>
              {liquidRaw("{% render 'theme-assets' %}")}
            </head>
          );
        }
      `;
      const output = compile(source);
      expect(output).toContain("{% render 'theme-assets' %}");
      expect(output).not.toContain('{{ ');
    });

    it('passes multiple liquidRaw() calls in the same component', () => {
      const source = `
        function Layout() {
          return (
            <head>
              {liquidRaw('{{ content_for_header }}')}
              {liquidRaw("{% render 'theme-assets' %}")}
            </head>
          );
        }
      `;
      const output = compile(source, 'Layout');
      expect(output).toContain('{{ content_for_header }}');
      expect(output).toContain("{% render 'theme-assets' %}");
    });

    it('works alongside tap() in the same component', () => {
      const source = `
        function Layout() {
          const shopName = tap('{{ shop.name }}', 'My Store');
          return (
            <html>
              <head>
                <title>{shopName}</title>
                {liquidRaw('{{ content_for_header }}')}
              </head>
            </html>
          );
        }
      `;
      const output = compile(source, 'Layout');
      expect(output).toContain('{{ shop.name }}');
      expect(output).toContain('{{ content_for_header }}');
    });

    it('handles Shopify form block tags', () => {
      const source = `
        function Foo() {
          return (
            <div>
              {liquidRaw("{% form 'product', product %}")}
              <button type="submit">Add</button>
              {liquidRaw('{% endform %}')}
            </div>
          );
        }
      `;
      const output = compile(source);
      expect(output).toContain("{% form 'product', product %}");
      expect(output).toContain('{% endform %}');
    });
  });

  describe('filter()', () => {
    it('converts filter on loop var without args', () => {
      const source = `
        function Foo() {
          const prices = tap('product.prices', []);
          return (
            <For each={prices}>
              {(price) => <span>{filter(price, 'money')}</span>}
            </For>
          );
        }
      `;
      const output = compile(source);
      expect(output).toContain('{{ price | money }}');
    });

    it('converts filter with key-value args', () => {
      const source = `
        function Foo() {
          const images = tap('product.images', []);
          return (
            <For each={images}>
              {(image) => <img src={filter(image, 'image_url', { width: 800 })} />}
            </For>
          );
        }
      `;
      const output = compile(source);
      expect(output).toContain('{{ image | image_url: width: 800 }}');
    });

    it('converts filter with multiple args', () => {
      const source = `
        function Foo() {
          const images = tap('product.images', []);
          return (
            <For each={images}>
              {(image) => <img src={filter(image, 'image_url', { width: 800, crop: 'center' })} />}
            </For>
          );
        }
      `;
      const output = compile(source);
      expect(output).toContain("{{ image | image_url: width: 800, crop: 'center' }}");
    });

    it('converts filter on tap-mapped var', () => {
      const source = `
        function Foo() {
          const price = tap('{{ product.price }}', 0);
          return <span>{filter(price, 'money')}</span>;
        }
      `;
      const output = compile(source);
      expect(output).toContain('{{ product.price | money }}');
    });

    it('supports chaining filters', () => {
      const source = `
        function Foo() {
          const price = tap('{{ product.price }}', 0);
          return <span>{filter(filter(price, 'money'), 'strip_html')}</span>;
        }
      `;
      const output = compile(source);
      expect(output).toContain('{{ product.price | money | strip_html }}');
    });

    it('works in attribute context (HTML-safe output)', () => {
      const source = `
        function Foo() {
          const images = tap('product.images', []);
          return (
            <For each={images}>
              {(image) => <img src={filter(image, 'image_url', { width: 800 })} alt="product" />}
            </For>
          );
        }
      `;
      const output = compile(source);
      expect(output).toContain('src="{{ image | image_url: width: 800 }}"');
    });
  });
});
