/**
 * ProductCard — Phase 2 milestone component.
 *
 * Demonstrates Phase 1 (tap() extraction) + Phase 2 (<Show> control flow):
 *   - tap() maps variables to Liquid expressions
 *   - <Show when={available}> compiles to {% if product.available %}
 *   - The JS bundle uses fallback values; Liquid handles SSR rendering
 */

import { createSignal, Show } from 'solid-js';
import { tap } from '$lib/runtime';
import { t } from '$lib/i18n';

interface ProductCardProps {
  title?: string;
  price?: string;
  imageUrl?: string;
  variantId?: number;
  available?: boolean;
}

export default function ProductCard(props: ProductCardProps) {
  const title = tap('{{ product.title }}', props.title ?? 'Product');
  const price = tap('{{ product.price | money }}', props.price ?? '$0.00');
  const imageUrl = tap("{{ product.featured_image | img_url: '600x' }}", props.imageUrl ?? '');
  const available = tap('{{ product.available }}', props.available ?? true);
  const variantId = tap('{{ product.selected_or_first_available_variant.id }}', props.variantId ?? 0);

  const [adding, setAdding] = createSignal(false);

  async function addToCart(e: MouseEvent) {
    setAdding(true);
    try {
      // The [data-component] wrapper element is the same node that Shopify
      // rendered the Liquid into. SolidJS's render() replaces its *children*,
      // not the element itself, so data-props still holds the server-evaluated
      // variant ID (e.g. {{ product.selected_or_first_available_variant.id | json }}
      // → 46839028482306). Reading it here is more reliable than the JS fallback.
      const wrapper = (e.currentTarget as HTMLElement).closest('[data-component="ProductCard"]');
      const id = wrapper
        ? (JSON.parse(wrapper.getAttribute('data-props') || '{}').variantId ?? variantId)
        : variantId;

      await fetch(window.Shopify.routes.root + 'cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ id, quantity: 1 }] }),
      });
      window.dispatchEvent(new CustomEvent('cart:updated'));
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div class="bg-surface rounded-card shadow-sm overflow-hidden" data-testid="product-card">
      <img src={imageUrl} alt={title} loading="lazy" class="w-full h-64 object-cover" />
      <div class="p-4 space-y-1">
        <h2 class="text-base font-semibold text-text">{title}</h2>
        <span class="text-sm font-bold text-gray-700">{price}</span>
      </div>
      <div class="px-4 pb-4">
        {/*
          Phase 2: <Show> compiles to {% if %} / {% else %}.
          - Liquid renders the initial HTML (available/sold-out)
          - JS bundle handles addToCart interaction after hydration
        */}
        <Show
          when={available}
          fallback={
            <span class="text-sm text-gray-400">{t('product.sold_out')}</span>
          }
        >
          <button
            class="w-full bg-primary text-white py-2 px-4 rounded-button font-medium hover:bg-accent transition-colors disabled:opacity-50"
            onClick={addToCart}
            disabled={adding()}
          >
            {adding() ? t('product.adding') : t('product.add_to_cart')}
          </button>
        </Show>
      </div>
    </div>
  );
}
