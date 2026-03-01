/**
 * MiniCart — Slide-out cart drawer with live /cart.js data.
 *
 * Liquid SSR output:
 *   <div class="relative" data-component="MiniCart" data-props='...'>
 *     <button ...>
 *       <span>{{ cart.item_count }}</span>
 *     </button>
 *     <!-- <Show> condition is not Liquid-mapped — rendered client-side -->
 *   </div>
 *
 * The drawer is entirely client-side (gated by the isOpen signal Show).
 * SolidJS hydrates the component and fetches /cart.js on drawer open.
 */

import { createSignal, For, Show, onMount, onCleanup } from 'solid-js';
import { tap } from '$lib/runtime';

interface CartItem {
  id: number;
  title: string;
  variant_title: string | null;
  quantity: number;
  price: number;
  image: string | null;
  url: string;
  variant_id: number;
  line_price: number;
}

interface CartData {
  item_count: number;
  total_price: number;
  items: CartItem[];
}

export default function MiniCart(props: { itemCount?: number }) {
  const itemCount = tap('{{ cart.item_count }}', props.itemCount ?? 0);
  const [isOpen, setIsOpen] = createSignal(false);
  const [cart, setCart] = createSignal<CartData | null>(null);
  const [loading, setLoading] = createSignal(false);

  onMount(() => {
    window.addEventListener('cart:updated', openCart);
    onCleanup(() => window.removeEventListener('cart:updated', openCart));
  });

  async function openCart() {
    setIsOpen(true);
    setLoading(true);
    const data = await fetch('/cart.js').then((r) => r.json());
    setCart(data);
    setLoading(false);
  }

  async function updateQty(variantId: number, qty: number) {
    const data = await fetch('/cart/change.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: variantId, quantity: qty }),
    }).then((r) => r.json());
    setCart(data);
  }

  const formatMoney = (cents: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

  return (
    <div class="relative">
      {/* Cart icon button — item count from Liquid SSR */}
      <button class="flex items-center gap-1.5 px-3 py-2 text-gray-600 hover:text-primary transition-colors" onClick={openCart}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M16 10a4 4 0 01-8 0" />
        </svg>
        <span class="text-sm font-medium">{itemCount}</span>
      </button>

      {/* Backdrop — client-side only */}
      <Show when={isOpen()}>
        <div class="fixed inset-0 bg-black/40 z-40" onClick={() => setIsOpen(false)} />
      </Show>

      {/* Drawer — client-side only */}
      <Show when={isOpen()}>
        <div class="fixed inset-y-0 right-0 z-50 w-96 max-w-full bg-white shadow-2xl flex flex-col">
          {/* Drawer header */}
          <div class="flex items-center justify-between px-6 py-4 border-b">
            <h2 class="text-lg font-semibold">Your Cart</h2>
            <button
              class="p-1 text-gray-500 hover:text-gray-900"
              onClick={() => setIsOpen(false)}
            >
              ✕
            </button>
          </div>

          {/* Drawer items */}
          <div class="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <Show
              when={!loading()}
              fallback={<p class="text-center py-8 text-gray-400">Loading…</p>}
            >
              <Show when={!cart() || cart()!.items.length === 0}>
                <p class="text-center py-16 text-gray-400">Your cart is empty.</p>
              </Show>
              <For each={cart()?.items ?? []}>
                {(item) => (
                  <div class="flex gap-4">
                    <Show when={item.image}>
                      <img
                        src={item.image!}
                        alt={item.title}
                        class="w-20 h-20 object-cover rounded"
                      />
                    </Show>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium truncate">{item.title}</p>
                      <Show when={item.variant_title}>
                        <p class="text-xs text-gray-500">{item.variant_title}</p>
                      </Show>
                      <div class="flex items-center gap-3 mt-2">
                        <div class="flex items-center border rounded">
                          <button
                            class="px-2 py-1 text-sm hover:bg-gray-50"
                            onClick={() => updateQty(item.variant_id, item.quantity - 1)}
                          >
                            −
                          </button>
                          <span class="px-3 py-1 text-sm">{item.quantity}</span>
                          <button
                            class="px-2 py-1 text-sm hover:bg-gray-50"
                            onClick={() => updateQty(item.variant_id, item.quantity + 1)}
                          >
                            +
                          </button>
                        </div>
                        <button
                          class="text-xs text-gray-400 hover:text-red-500"
                          onClick={() => updateQty(item.variant_id, 0)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <p class="text-sm font-semibold whitespace-nowrap">
                      {formatMoney(item.line_price)}
                    </p>
                  </div>
                )}
              </For>
            </Show>
          </div>

          {/* Drawer footer */}
          <div class="border-t px-6 py-4 space-y-3">
            <Show when={cart()}>
              <div class="flex justify-between text-base font-semibold">
                <span>Subtotal</span>
                <span>{formatMoney(cart()!.total_price)}</span>
              </div>
            </Show>
            <a
              href="/cart"
              class="block w-full text-center bg-primary text-white py-3 rounded-button font-medium hover:bg-accent transition-colors"
            >
              View Cart
            </a>
            <a
              href="/checkout"
              class="block w-full text-center border border-primary text-primary py-3 rounded-button font-medium hover:bg-primary hover:text-white transition-colors"
            >
              Checkout →
            </a>
          </div>
        </div>
      </Show>
    </div>
  );
}
