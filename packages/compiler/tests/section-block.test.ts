/**
 * section-block.test.ts
 *
 * Integration tests for section/block primitives in generateLiquid():
 *   - <Match on={...}> → {% case %}…{% endcase %}
 *   - <Case value="…"> → {% when '…' %}
 *   - {...blockAttrs()} → {{ block.shopify_attributes }}
 *   - sectionComponents option → {% section %} instead of {% render %}
 */

import { describe, it, expect } from 'vitest';
import { extractTapMappings } from '../src/tap-extract';
import { generateLiquid } from '../src/liquid-gen';

function compile(
  source: string,
  opts: { componentName?: string; sectionComponents?: Set<string> } = {},
) {
  const componentName = opts.componentName ?? 'TestComponent';
  const { mappings } = extractTapMappings(source, `${componentName}.tsx`);
  return generateLiquid(source, mappings, {
    componentName,
    sectionComponents: opts.sectionComponents,
  });
}

// ---------------------------------------------------------------------------
// <Match> / <Case> → {% case %}{% when %}
// ---------------------------------------------------------------------------

describe('<Match> / <Case> → {% case %}{% when %}', () => {
  it('renders <Match on={block.type}> with loop var → {% case block.type %}', () => {
    const source = `
      function Comp() {
        const blocks = tap('{{ section.blocks }}', []);
        return (
          <div>
            <For each={blocks}>
              {(block) => (
                <Match on={block.type}>
                  <Case value="item">
                    <p>item content</p>
                  </Case>
                </Match>
              )}
            </For>
          </div>
        );
      }
    `;
    const output = compile(source);
    expect(output).toContain('{% case block.type %}');
    expect(output).toContain("{% when 'item' %}");
    expect(output).toContain('{% endcase %}');
    expect(output).toContain('<p>item content</p>');
  });

  it('renders a single <Case value> branch', () => {
    const source = `
      function Comp() {
        const blocks = tap('{{ section.blocks }}', []);
        return (
          <div>
            <For each={blocks}>
              {(block) => (
                <Match on={block.type}>
                  <Case value="promo">
                    <span>promo</span>
                  </Case>
                </Match>
              )}
            </For>
          </div>
        );
      }
    `;
    const output = compile(source);
    expect(output).toContain("{% when 'promo' %}");
    expect(output).toContain('<span>promo</span>');
  });

  it('renders multiple <Case> branches as multiple {% when %}', () => {
    const source = `
      function Comp() {
        const blocks = tap('{{ section.blocks }}', []);
        return (
          <div>
            <For each={blocks}>
              {(block) => (
                <Match on={block.type}>
                  <Case value="item">
                    <div>item</div>
                  </Case>
                  <Case value="promo">
                    <div>promo</div>
                  </Case>
                  <Case value="video">
                    <div>video</div>
                  </Case>
                </Match>
              )}
            </For>
          </div>
        );
      }
    `;
    const output = compile(source);
    expect(output).toContain("{% when 'item' %}");
    expect(output).toContain("{% when 'promo' %}");
    expect(output).toContain("{% when 'video' %}");
    expect(output).toContain('<div>item</div>');
    expect(output).toContain('<div>promo</div>');
    expect(output).toContain('<div>video</div>');
  });

  it('renders <Match> with a tap-mapped identifier', () => {
    const source = `
      function Comp() {
        const blockType = tap('{{ block.type }}', 'item');
        return (
          <div>
            <Match on={blockType}>
              <Case value="item">
                <span>item</span>
              </Case>
            </Match>
          </div>
        );
      }
    `;
    const output = compile(source);
    expect(output).toContain('{% case block.type %}');
    expect(output).toContain("{% when 'item' %}");
    expect(output).toContain('{% endcase %}');
  });

  it('emits a client-side comment for non-resolvable <Match> expression', () => {
    const source = `
      function Comp() {
        const [mode, setMode] = createSignal('a');
        return (
          <div>
            <Match on={mode()}>
              <Case value="a"><span>a</span></Case>
            </Match>
          </div>
        );
      }
    `;
    const output = compile(source);
    expect(output).toContain('<!-- <Match> expression is not Liquid-mapped');
    expect(output).not.toContain('{% case');
  });

  it('emits a comment when <Case> appears outside <Match>', () => {
    const source = `
      function Comp() {
        return (
          <div>
            <Case value="item"><span>item</span></Case>
          </div>
        );
      }
    `;
    const output = compile(source);
    expect(output).toContain('<!-- <Case> must appear inside <Match> -->');
    expect(output).not.toContain("{% when 'item' %}");
  });

  it('emits a comment for <Match> missing the on prop', () => {
    const source = `
      function Comp() {
        return (
          <div>
            <Match>
              <Case value="x"><p>x</p></Case>
            </Match>
          </div>
        );
      }
    `;
    const output = compile(source);
    expect(output).toContain("<!-- <Match> missing 'on' prop -->");
  });
});

// ---------------------------------------------------------------------------
// {...blockAttrs()} → {{ block.shopify_attributes }}
// ---------------------------------------------------------------------------

describe('{...blockAttrs()} spread → {{ block.shopify_attributes }}', () => {
  it('emits {{ block.shopify_attributes }} in the opening tag', () => {
    const source = `
      function Comp() {
        return (
          <div {...blockAttrs()} class="featured-item">
            <p>content</p>
          </div>
        );
      }
    `;
    const output = compile(source);
    expect(output).toContain('{{ block.shopify_attributes }}');
    expect(output).toContain('class="featured-item"');
  });

  it('places {{ block.shopify_attributes }} before regular attributes', () => {
    const source = `
      function Comp() {
        return (
          <article {...blockAttrs()} id="block" class="block-wrap">
            content
          </article>
        );
      }
    `;
    const output = compile(source);
    // shopify_attributes should appear in the opening tag
    const openingTagMatch = output.match(/<article[^>]+>/);
    expect(openingTagMatch).not.toBeNull();
    const openingTag = openingTagMatch![0];
    expect(openingTag).toContain('{{ block.shopify_attributes }}');
    expect(openingTag).toContain('id="block"');
    expect(openingTag).toContain('class="block-wrap"');
    // shopify_attributes should appear before id
    expect(openingTag.indexOf('{{ block.shopify_attributes }}')).toBeLessThan(
      openingTag.indexOf('id="block"'),
    );
  });

  it('ignores non-blockAttrs spread attributes', () => {
    const source = `
      function Comp() {
        const extra = { id: 'x' };
        return (
          <div {...extra} class="c">content</div>
        );
      }
    `;
    const output = compile(source);
    // Unknown spreads should not emit block.shopify_attributes
    expect(output).not.toContain('{{ block.shopify_attributes }}');
    expect(output).toContain('class="c"');
  });
});

// ---------------------------------------------------------------------------
// sectionComponents → {% section %} tag
// ---------------------------------------------------------------------------

describe('sectionComponents option → {% section %} tag', () => {
  it('emits {% section %} when the component is in sectionComponents', () => {
    const source = `
      function Page() {
        return (
          <div class="page">
            <FeaturedProduct />
          </div>
        );
      }
    `;
    const output = compile(source, {
      sectionComponents: new Set(['FeaturedProduct']),
    });
    expect(output).toContain("{% section 'featured-product' %}");
    expect(output).not.toContain("{% render 'featured-product'");
  });

  it('emits {% render %} when the component is NOT in sectionComponents', () => {
    const source = `
      function Page() {
        return (
          <div class="page">
            <ProductCard />
          </div>
        );
      }
    `;
    const output = compile(source, {
      sectionComponents: new Set(['FeaturedProduct']),
    });
    expect(output).toContain("{% render 'product-card'");
    expect(output).not.toContain("{% section 'product-card' %}");
  });

  it('emits {% section %} with no parameters even when parent has tap mappings', () => {
    const source = `
      function Page() {
        const product = tap('{{ product }}', null);
        return (
          <div>
            <FeaturedProduct />
          </div>
        );
      }
    `;
    const output = compile(source, {
      sectionComponents: new Set(['FeaturedProduct']),
    });
    // Section tag must not have parameters
    expect(output).toMatch(/\{%\s*section\s+'featured-product'\s*%\}/);
    expect(output).not.toContain("{% section 'featured-product',");
  });

  it('uses an empty sectionComponents set by default', () => {
    const source = `
      function Page() {
        return (
          <div>
            <FeaturedProduct />
          </div>
        );
      }
    `;
    // Without sectionComponents option → falls back to {% render %}
    const output = compile(source);
    expect(output).toContain("{% render 'featured-product' %}");
  });
});

// ---------------------------------------------------------------------------
// Full FeaturedProduct-like integration
// ---------------------------------------------------------------------------

describe('FeaturedProduct integration', () => {
  it('generates the correct liquid for a section with Match/Case and blockAttrs', () => {
    const source = `
      export const schema = { name: 'Featured Product', settings: [] };

      export default function FeaturedProduct() {
        const heading = tap('{{ section.settings.heading }}', 'New Arrivals');
        const blocks = tap('{{ section.blocks }}', []);

        return (
          <section class="featured-product">
            <h2>{heading}</h2>
            <For each={blocks}>
              {(block) => (
                <Match on={block.type}>
                  <Case value="item">
                    <div {...blockAttrs()} class="featured-item">
                      <p>{block.settings.title}</p>
                    </div>
                  </Case>
                </Match>
              )}
            </For>
          </section>
        );
      }
    `;
    const output = compile(source);
    expect(output).toContain('{{ section.settings.heading }}');
    expect(output).toContain('{% for block in section.blocks %}');
    expect(output).toContain('{% case block.type %}');
    expect(output).toContain("{% when 'item' %}");
    expect(output).toContain('{{ block.shopify_attributes }}');
    expect(output).toContain('{{ block.settings.title }}');
    expect(output).toContain('{% endcase %}');
    expect(output).toContain('{% endfor %}');
  });
});
