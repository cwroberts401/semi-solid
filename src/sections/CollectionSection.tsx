/**
 * CollectionSection — Shopify section for the collection listing page.
 *
 * Exported `schema` makes this a section (sections/collection-section.liquid).
 * Merchants can toggle and reorder blocks in the Theme Customizer.
 *
 * Blocks:
 *   header       — collection title + description banner
 *   product_grid — responsive product card grid
 *
 * Expected Liquid output (excerpt):
 *   {% for block in section.blocks %}
 *     {% case block.type %}
 *       {% when 'header' %}
 *         <div {{ block.shopify_attributes }} ...>
 *           <h1 ...>{{ collection.title }}</h1>
 *           <div ...>{{ collection.description }}</div>
 *         </div>
 *       {% when 'product_grid' %}
 *         <div {{ block.shopify_attributes }} ...>
 *           {% for product in collection.products %}
 *             <a href="{{ product.url }}">...</a>
 *           {% endfor %}
 *         </div>
 *     {% endcase %}
 *   {% endfor %}
 */

import { For } from 'solid-js';
import { tap, blockAttrs, filter } from '$lib/runtime';

interface CollectionProduct {
  title: string;
  url: string;
  featured_image: { src: string; alt: string };
  /** Raw price in store currency — apply | money filter in production Liquid */
  price: number;
  vendor: string;
  available: boolean;
}

export const schema = {
  name: 'Collection',
  settings: [],
  blocks: [
    {
      type: 'header',
      name: 'Collection header',
      limit: 1,
      settings: [
        {
          type: 'checkbox',
          id: 'show_description',
          label: 'Show description',
          default: true,
        },
      ],
    },
    {
      type: 'product_grid',
      name: 'Product grid',
      limit: 1,
      settings: [
        {
          type: 'range',
          id: 'columns_desktop',
          label: 'Number of columns on desktop',
          min: 1,
          max: 5,
          step: 1,
          default: 4,
        },
        {
          type: 'checkbox',
          id: 'show_vendor',
          label: 'Show vendor',
          default: false,
        },
      ],
    },
  ],
  presets: [
    {
      name: 'Collection',
      blocks: [
        { type: 'header' },
        { type: 'product_grid' },
      ],
    },
  ],
} as const;

export default function CollectionSection(props: {
  title?: string;
  description?: string;
  products?: CollectionProduct[];
  blocks?: Array<{ type: string }>;
}) {
  const blocks = tap('{{ section.blocks }}', props.blocks ?? []);
  const title = tap('{{ collection.title }}', props.title ?? '');
  const description = tap('{{ collection.description }}', props.description ?? '');
  const products = tap('{{ collection.products }}', props.products ?? []);

  return (
    <div class="collection-section max-w-7xl mx-auto px-4 py-8">
      <For each={blocks}>
        {(block) => (
          <Match on={block.type}>
            <Case value="header">
              <div {...blockAttrs()} class="collection-header mb-8 border-b pb-6">
                <h1 class="text-4xl font-bold text-primary">{title}</h1>
                <div class="prose mt-4 text-gray-600">{description}</div>
              </div>
            </Case>
            <Case value="product_grid">
              <div {...blockAttrs()} class="product-grid">
                <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <For each={products}>
                    {(product) => (
                      <a href={product.url} class="group block">
                        <div class="aspect-square overflow-hidden rounded-lg bg-gray-100">
                          <img
                            src={filter(product.images.first, 'image_url', { width: 600 })}
                            alt={product.featured_image.alt}
                            loading="lazy"
                            class="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        </div>
                        <div class="mt-3 space-y-1">
                          <h3 class="text-sm font-medium text-gray-900">{product.title}</h3>
                          <p class="text-sm text-gray-500">{product.vendor}</p>
                          <p class="text-sm font-semibold text-gray-900">{product.price}</p>
                        </div>
                      </a>
                    )}
                  </For>
                </div>
              </div>
            </Case>
          </Match>
        )}
      </For>
    </div>
  );
}
