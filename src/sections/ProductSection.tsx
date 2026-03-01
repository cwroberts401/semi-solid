/**
 * ProductSection — Shopify section for the product detail page.
 *
 * Exported `schema` makes this a section (sections/product-section.liquid)
 * rather than a snippet. Merchants can reorder and toggle content blocks in
 * the Theme Customizer.
 *
 * Left column: product image gallery (fixed).
 * Right column: configurable blocks — title, price, description,
 *               variant picker, and buy buttons.
 *
 * Expected Liquid output (right column excerpt):
 *   {% for block in section.blocks %}
 *     {% case block.type %}
 *       {% when 'title' %}
 *         <h1 {{ block.shopify_attributes }} ...>{{ product.title }}</h1>
 *       {% when 'price' %}
 *         <p {{ block.shopify_attributes }} ...>{{ product.price | money }}</p>
 *       ...
 *     {% endcase %}
 *   {% endfor %}
 */

import { For } from 'solid-js';
import { tap, blockAttrs } from '$lib/runtime';
import ImageGallery from '$blocks/ImageGallery';
import VariantSelector from '$blocks/VariantSelector';
import AddToCartButton from '$blocks/AddToCartButton';

export const schema = {
  name: 'Product',
  tag: 'section',
  class: 'section-product',
  settings: [
    {
      type: 'select',
      id: 'image_position',
      label: 'Image position',
      options: [
        { value: 'left', label: 'Left' },
        { value: 'right', label: 'Right' },
      ],
      default: 'left',
    },
  ],
  blocks: [
    {
      type: 'title',
      name: 'Title',
      limit: 1,
      settings: [
        {
          type: 'select',
          id: 'heading_size',
          label: 'Heading size',
          options: [
            { value: 'h1', label: 'Large' },
            { value: 'h2', label: 'Medium' },
          ],
          default: 'h1',
        },
      ],
    },
    {
      type: 'price',
      name: 'Price',
      limit: 1,
      settings: [],
    },
    {
      type: 'description',
      name: 'Description',
      limit: 1,
      settings: [],
    },
    {
      type: 'variant_picker',
      name: 'Variant picker',
      limit: 1,
      settings: [],
    },
    {
      type: 'buy_buttons',
      name: 'Buy buttons',
      limit: 1,
      settings: [],
    },
  ],
  presets: [
    {
      name: 'Product',
      blocks: [
        { type: 'title' },
        { type: 'price' },
        { type: 'description' },
        { type: 'variant_picker' },
        { type: 'buy_buttons' },
      ],
    },
  ],
} as const;

export default function ProductSection(props: {
  title?: string;
  price?: string;
  description?: string;
  blocks?: Array<{ type: string }>;
}) {
  const blocks = tap('{{ section.blocks }}', props.blocks ?? []);
  const title = tap('{{ product.title }}', props.title ?? '');
  const price = tap('{{ product.price | money }}', props.price ?? '$0.00');
  const description = tap('{{ product.description }}', props.description ?? '');

  return (
    <div class="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-7xl mx-auto px-4 py-8">
      <div class="product-gallery">
        <ImageGallery />
      </div>
      <div class="space-y-6">
        <For each={blocks}>
          {(block) => (
            <Match on={block.type}>
              <Case value="title">
                <h1 {...blockAttrs()} class="text-3xl font-bold text-primary">{title}</h1>
              </Case>
              <Case value="price">
                <p {...blockAttrs()} class="text-2xl font-bold text-gray-900">{price}</p>
              </Case>
              <Case value="description">
                <div {...blockAttrs()} class="prose text-gray-700">{description}</div>
              </Case>
              <Case value="variant_picker">
                <div {...blockAttrs()}>
                  <VariantSelector />
                </div>
              </Case>
              <Case value="buy_buttons">
                <div {...blockAttrs()}>
                  <AddToCartButton />
                </div>
              </Case>
            </Match>
          )}
        </For>
      </div>
    </div>
  );
}
