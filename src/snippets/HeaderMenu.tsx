/**
 * HeaderMenu — Shopify linklists.main-menu.links-driven navigation.
 *
 * Desktop: CSS-only dropdown via Tailwind group-hover (no JS needed).
 * Mobile: JS-toggled overlay via createSignal(mobileOpen).
 *
 * Liquid SSR output:
 *   {% for link in linklists.main-menu.links %}
 *     <a href="{{ link.url }}">{{ link.title }}</a>
 *     {% for child in link.links %}
 *       <a href="{{ child.url }}">{{ child.title }}</a>
 *     {% endfor %}
 *   {% endfor %}
 *
 * The mobile overlay (Show when={mobileOpen()}) is client-side only —
 * the signal makes this component interactive so it gets data-component hydration.
 */

import { createSignal, For, Show } from 'solid-js';
import { tap } from '$lib/runtime';

interface NavLink {
  title: string;
  url: string;
  links?: NavLink[];
}

export default function HeaderMenu(props: { links?: NavLink[] }) {
  const links = tap('linklists.main-menu.links', props.links ?? []);
  const [mobileOpen, setMobileOpen] = createSignal(false);

  return (
    <div class="flex items-center">
      {/* Desktop nav — SSR via Liquid for loops */}
      <nav class="hidden md:flex items-center gap-1">
        <For each={links}>
          {(link) => (
            <div class="relative group">
              <a
                href={link.url}
                class="px-3 py-2 text-sm font-medium text-gray-700 hover:text-primary transition-colors"
              >
                {link.title}
              </a>
              {/* Dropdown — CSS-only via group-hover, no JS */}
              <div class="absolute top-full left-0 hidden group-hover:block w-48 bg-white border border-gray-100 rounded-lg shadow-lg z-10 py-1">
                <For each={link.links}>
                  {(child) => (
                    <a
                      href={child.url}
                      class="block px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-primary"
                    >
                      {child.title}
                    </a>
                  )}
                </For>
              </div>
            </div>
          )}
        </For>
      </nav>

      {/* Mobile hamburger button — hydrated by JS */}
      <button
        class="md:hidden p-2 text-gray-600 hover:text-primary"
        onClick={() => setMobileOpen((v) => !v)}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Mobile overlay — client-side only (signal-gated Show) */}
      <Show when={mobileOpen()}>
        <div class="fixed inset-0 z-50 bg-white overflow-y-auto">
          <div class="flex items-center justify-between px-4 py-4 border-b">
            <span class="font-semibold">Menu</span>
            <button
              class="p-2 text-gray-600 hover:text-primary"
              onClick={() => setMobileOpen(false)}
            >
              ✕
            </button>
          </div>
          <nav class="px-4 py-6 space-y-4">
            <For each={links}>
              {(link) => (
                <div>
                  <a href={link.url} class="block text-lg font-medium text-gray-900">
                    {link.title}
                  </a>
                  <div class="ml-4 mt-2 space-y-2">
                    <For each={link.links}>
                      {(child) => (
                        <a href={child.url} class="block text-sm text-gray-600 hover:text-primary">
                          {child.title}
                        </a>
                      )}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </nav>
        </div>
      </Show>
    </div>
  );
}
