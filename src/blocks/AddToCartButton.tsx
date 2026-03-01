/**
 * AddToCartButton — standalone add-to-cart button.
 *
 * Liquid SSR output:
 *   <div data-component="AddToCartButton" data-props='...'>
 *     <!-- client-side (Show condition is signal-based) -->
 *   </div>
 *
 * Listens for `variant:changed` events from VariantSelector to update
 * the active variant ID and availability. Posts to /cart/add.js and
 * dispatches `cart:updated` to open the MiniCart drawer.
 */

import { createSignal, onMount, onCleanup, Show } from 'solid-js';
import { tap } from '$lib/runtime';
import { t } from '$lib/i18n';

export default function AddToCartButton(props: { variantId?: number; available?: boolean }) {
  // Tap var names match prop names so data-props keys align with what props receives.
  const variantId = tap(
    '{{ product.selected_or_first_available_variant.id }}',
    props.variantId ?? 0
  );
  const available = tap(
    '{{ product.selected_or_first_available_variant.available }}',
    props.available ?? true
  );

  const [currentId, setCurrentId] = createSignal(variantId);
  const [isAvailable, setIsAvailable] = createSignal(available);
  const [adding, setAdding] = createSignal(false);

  onMount(() => {
    function onVariantChanged(e: Event) {
      const detail = (e as CustomEvent<{ variantId: number; available: boolean }>).detail;
      setCurrentId(detail.variantId);
      setIsAvailable(detail.available);
    }
    window.addEventListener('variant:changed', onVariantChanged);
    onCleanup(() => window.removeEventListener('variant:changed', onVariantChanged));
  });

  async function addToCart() {
    setAdding(true);
    try {
      await fetch(window.Shopify.routes.root + 'cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ id: currentId(), quantity: 1 }] }),
      });
      window.dispatchEvent(new CustomEvent('cart:updated'));
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div>
      <Show
        when={isAvailable()}
        fallback={<span class="text-sm text-gray-400">{t('product.sold_out')}</span>}
      >
        <button
          class="w-full bg-primary text-white py-3 px-6 rounded-button font-medium hover:bg-accent transition-colors disabled:opacity-50"
          onClick={addToCart}
          disabled={adding()}
        >
          {adding() ? t('product.adding') : t('product.add_to_cart')}
        </button>
      </Show>
    </div>
  );
}
