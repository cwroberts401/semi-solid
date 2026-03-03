/**
 * MiniCart — Slide-out cart drawer with live /cart.js data.
 *
 * Liquid SSR output:
 *   <div class="relative" data-component="MiniCart" data-props='...'>
 *     <button ...>
 *       <span>{{ cart.item_count }}</span>
 *     </button>
 *     <!-- drawer rendered client-side only -->
 *   </div>
 *
 * The drawer is entirely client-side (gated by the isOpen signal).
 * SolidJS hydrates the component and fetches /cart.js on drawer open.
 */

import { createSignal, createMemo, For, Show, onMount, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import { Transition, TransitionGroup } from 'solid-transition-group';
import { tap } from '$lib/runtime';

interface CartItem {
  id: number;
  key: string;
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

export default function MiniCart(props: { ssrItemCount?: number }) {
  const ssrItemCount = tap('{{ cart.item_count }}', props.ssrItemCount ?? 0);
  const [isOpen, setIsOpen] = createSignal(false);
  const [cart, setCart] = createSignal<CartData | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [updating, setUpdating] = createSignal<string | null>(null);

  const itemCount = createMemo(() => cart()?.item_count ?? ssrItemCount);

  async function fetchCart() {
    const data = await fetch('/cart.js').then((r) => r.json());
    setCart(data);
    return data as CartData;
  }

  async function openCart() {
    setIsOpen(true);
    document.body.style.overflow = 'hidden';
    setLoading(true);
    await fetchCart();
    setLoading(false);
  }

  function closeCart() {
    setIsOpen(false);
    document.body.style.overflow = '';
  }

  onMount(() => {
    const onCartUpdated = () => openCart();
    window.addEventListener('cart:updated', onCartUpdated);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen()) closeCart();
    };
    window.addEventListener('keydown', onKeyDown);

    onCleanup(() => {
      window.removeEventListener('cart:updated', onCartUpdated);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    });
  });

  async function updateQty(key: string, qty: number) {
    setUpdating(key);
    try {
      const data = await fetch('/cart/change.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: key, quantity: qty }),
      }).then((r) => r.json());
      setCart(data);
    } finally {
      setUpdating(null);
    }
  }

  const formatMoney = (cents: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

  return (
    <div class="relative">
      {/* Cart icon button — item count updates after fetch */}
      <button
        class="flex items-center gap-1.5 px-3 py-2 text-gray-600 hover:text-primary transition-colors"
        onClick={openCart}
        aria-label="Open cart"
      >
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
        <span class="text-sm font-medium">{ssrItemCount}</span>
      </button>

      {/* Portal renders the overlay at <body> level so it escapes the
          header's backdrop-blur-sm, which creates a containing block that
          prevents position:fixed children from spanning the full viewport.
          Gated by mounted() so the Liquid compiler skips it entirely — Portal
          and Transition are client-only primitives with no Liquid equivalent. */}
      <Portal>
        {/* Backdrop — fades in/out */}
        <Transition
          enterActiveClass="transition-opacity duration-300 ease-out"
          enterClass="opacity-0"
          enterToClass="opacity-100"
          exitActiveClass="transition-opacity duration-200 ease-in"
          exitClass="opacity-100"
          exitToClass="opacity-0"
        >
          <Show when={isOpen()}>
            <div class="fixed inset-0 bg-black/40 z-40" onClick={closeCart} />
          </Show>
        </Transition>

        {/* Drawer — slides in from right */}
        <Transition
          enterActiveClass="transition-transform duration-300 ease-out"
          enterClass="translate-x-full"
          enterToClass="translate-x-0"
          exitActiveClass="transition-transform duration-200 ease-in"
          exitClass="translate-x-0"
          exitToClass="translate-x-full"
        >
          <Show when={isOpen()}>
            <div class="fixed inset-y-0 right-0 z-50 w-96 max-w-full bg-white shadow-2xl flex flex-col">
              {/* Header */}
              <div class="flex items-center justify-between px-6 py-4 border-b">
                <h2 class="text-lg font-semibold">Your Cart</h2>
                <button
                  class="p-1.5 text-gray-400 hover:text-gray-900 transition-colors rounded-full hover:bg-gray-100"
                  onClick={closeCart}
                  aria-label="Close cart"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Items */}
              <div class="flex-1 overflow-y-auto px-6 py-4">
                <Show
                  when={!loading()}
                  fallback={
                    <div class="flex items-center justify-center py-16">
                      <div class="w-6 h-6 border-2 border-gray-300 border-t-primary rounded-full animate-spin" />
                    </div>
                  }
                >
                  <Show when={cart() && cart()!.items.length > 0} fallback={
                    <p class="text-center py-16 text-gray-400">Your cart is empty.</p>
                  }>
                    <ul class="space-y-4">
                      <TransitionGroup
                        enterActiveClass="transition-all duration-200 ease-out"
                        enterClass="opacity-0 -translate-x-2"
                        enterToClass="opacity-100 translate-x-0"
                        exitActiveClass="transition-all duration-200 ease-in"
                        exitClass="opacity-100 max-h-32"
                        exitToClass="opacity-0 max-h-0"
                      >
                        <For each={cart()!.items}>
                          {(item) => (
                            <li
                              class="flex gap-4 py-2"
                              classList={{ 'opacity-50 pointer-events-none': updating() === item.key }}
                            >
                              <Show when={item.image}>
                                <a href={item.url} class="shrink-0">
                                  <img
                                    src={item.image!}
                                    alt={item.title}
                                    class="w-20 h-20 object-cover rounded"
                                  />
                                </a>
                              </Show>
                              <div class="flex-1 min-w-0">
                                <a href={item.url} class="text-sm font-medium truncate block hover:text-primary transition-colors">
                                  {item.title}
                                </a>
                                <Show when={item.variant_title}>
                                  <p class="text-xs text-gray-500">{item.variant_title}</p>
                                </Show>
                                <div class="flex items-center gap-3 mt-2">
                                  <div class="flex items-center border rounded">
                                    <button
                                      class="px-2 py-1 text-sm hover:bg-gray-100 transition-colors disabled:opacity-40"
                                      disabled={updating() === item.key}
                                      onClick={() => updateQty(item.key, item.quantity - 1)}
                                      aria-label="Decrease quantity"
                                    >
                                      −
                                    </button>
                                    <span class="px-3 py-1 text-sm tabular-nums">{item.quantity}</span>
                                    <button
                                      class="px-2 py-1 text-sm hover:bg-gray-100 transition-colors disabled:opacity-40"
                                      disabled={updating() === item.key}
                                      onClick={() => updateQty(item.key, item.quantity + 1)}
                                      aria-label="Increase quantity"
                                    >
                                      +
                                    </button>
                                  </div>
                                  <button
                                    class="text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40"
                                    disabled={updating() === item.key}
                                    onClick={() => updateQty(item.key, 0)}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                              <p class="text-sm font-semibold whitespace-nowrap tabular-nums">
                                {formatMoney(item.line_price)}
                              </p>
                            </li>
                          )}
                        </For>
                      </TransitionGroup>
                    </ul>
                  </Show>
                </Show>
              </div>

              {/* Footer */}
              <div class="border-t px-6 py-4 space-y-3">
                <Show when={cart() && cart()!.items.length > 0}>
                  <div class="flex justify-between text-base font-semibold">
                    <span>Subtotal</span>
                    <span class="tabular-nums">{formatMoney(cart()!.total_price)}</span>
                  </div>
                </Show>
                <a
                  href="/cart"
                  class="block w-full text-center bg-primary text-white py-3 rounded-button font-medium hover:bg-accent transition-colors"
                >
                  View Cart
                </a>
                <Show when={cart() && cart()!.items.length > 0}>
                  <a
                    href="/checkout"
                    class="block w-full text-center border border-primary text-primary py-3 rounded-button font-medium hover:bg-primary hover:text-white transition-colors"
                  >
                    Checkout
                  </a>
                </Show>
              </div>
            </div>
          </Show>
        </Transition>
      </Portal>
    </div>
  );
}
