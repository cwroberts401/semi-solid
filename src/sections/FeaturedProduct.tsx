import { For } from 'solid-js';
import { tap, blockAttrs, liquidRaw } from '$lib/runtime';

interface FeaturedProductBlock {
  type: string;
  settings: { title?: string; subtitle?: string };
}

export const schema = {
  name: 'Featured Product',
  settings: [
    { type: 'text', id: 'heading', label: 'Heading', default: 'New Arrivals' },
  ],
  blocks: [
    {
      type: 'item',
      name: 'Item',
      settings: [
        { type: 'text', id: 'title', label: 'Title' },
        { type: 'text', id: 'subtitle', label: 'Subtitle' },
      ],
    },
  ],
  max_blocks: 6,
  presets: [{ name: 'Featured Product' }],
} as const;

export default function FeaturedProduct(props: { heading?: string; blocks?: FeaturedProductBlock[] }) {
  const heading = tap('{{ section.settings.heading }}', props.heading ?? 'New Arrivals');
  const blocks = tap('{{ section.blocks }}', props.blocks ?? []);

  return (
    <section id={liquidRaw('shopify-section-{{ section.id }}')} class="featured-product py-12">
      <div class="max-w-7xl mx-auto px-4">
        <h2 class="text-3xl font-bold mb-8">{heading}</h2>
        <div class="grid grid-cols-3 gap-6">
          <For each={blocks}>
            {(block) => (
              <Match on={block.type}>
                <Case value="item">
                  <div {...blockAttrs()} class="featured-item">
                    <p>{block.settings.title}</p>
                    <p>{block.settings.subtitle}</p>
                  </div>
                </Case>
              </Match>
            )}
          </For>
        </div>
      </div>
    </section>
  );
}
