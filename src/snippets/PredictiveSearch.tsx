/**
 * PredictiveSearch — Search overlay with live results from Shopify Predictive Search API.
 *
 * Liquid SSR output:
 *   <div class="relative" data-component="PredictiveSearch" data-props='...'>
 *     <button ...>
 *       <svg><!-- search icon --></svg>
 *     </button>
 *     <!-- overlay rendered client-side only -->
 *   </div>
 *
 * The overlay (input + results dropdown) is entirely client-side, gated by
 * the isOpen signal. SolidJS hydrates and fetches /search/suggest.json on input.
 */

import { createSignal, For, Show, onMount, onCleanup } from 'solid-js';
import { tap } from '$lib/runtime';

interface PredictiveProduct {
  id: number;
  title: string;
  handle: string;
  url: string;
  image: string | null;
  price: string;
}

interface PredictiveCollection {
  id: number;
  title: string;
  handle: string;
  url: string;
}

interface PredictivePage {
  id: number;
  title: string;
  handle: string;
  url: string;
}

interface SearchResults {
  products: PredictiveProduct[];
  collections: PredictiveCollection[];
  pages: PredictivePage[];
}

export default function PredictiveSearch() {
  const searchUrl = tap('{{ routes.search_url }}', '/search');

  const [isOpen, setIsOpen] = createSignal(false);
  const [query, setQuery] = createSignal('');
  const [results, setResults] = createSignal<SearchResults>({ products: [], collections: [], pages: [] });
  const [loading, setLoading] = createSignal(false);
  const [activeIndex, setActiveIndex] = createSignal(-1);

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let inputRef: HTMLInputElement | undefined;

  function open() {
    setIsOpen(true);
    // Focus the input after the DOM updates
    requestAnimationFrame(() => inputRef?.focus());
  }

  function close() {
    setIsOpen(false);
    setQuery('');
    setResults({ products: [], collections: [], pages: [] });
    setActiveIndex(-1);
  }

  function flatResults(): { type: string; title: string; url: string }[] {
    const r = results();
    const items: { type: string; title: string; url: string }[] = [];
    for (const p of r.products) items.push({ type: 'product', title: p.title, url: p.url });
    for (const c of r.collections) items.push({ type: 'collection', title: c.title, url: c.url });
    for (const pg of r.pages) items.push({ type: 'page', title: pg.title, url: pg.url });
    return items;
  }

  async function fetchResults(q: string) {
    if (!q.trim()) {
      setResults({ products: [], collections: [], pages: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q,
        'resources[type]': 'product,collection,page',
        'resources[limit]': '6',
      });
      const res = await fetch(`/search/suggest.json?${params}`);
      const data = await res.json();
      const r = data.resources?.results ?? {};
      setResults({
        products: (r.products ?? []).map((p: any) => ({
          id: p.id,
          title: p.title,
          handle: p.handle,
          url: p.url,
          image: p.image ?? p.featured_image?.url ?? null,
          price: p.price,
        })),
        collections: (r.collections ?? []).map((c: any) => ({
          id: c.id,
          title: c.title,
          handle: c.handle,
          url: c.url,
        })),
        pages: (r.pages ?? []).map((pg: any) => ({
          id: pg.id,
          title: pg.title,
          handle: pg.handle,
          url: pg.url,
        })),
      });
    } catch {
      setResults({ products: [], collections: [], pages: [] });
    }
    setLoading(false);
    setActiveIndex(-1);
  }

  function onInput(e: InputEvent) {
    const value = (e.currentTarget as HTMLInputElement).value;
    setQuery(value);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fetchResults(value), 300);
  }

  function onKeyDown(e: KeyboardEvent) {
    const items = flatResults();
    const total = items.length;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i < total - 1 ? i + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i > 0 ? i - 1 : total - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const idx = activeIndex();
      if (idx >= 0 && idx < total) {
        window.location.href = items[idx].url;
      } else if (query().trim()) {
        window.location.href = `${searchUrl}?q=${encodeURIComponent(query())}`;
      }
    } else if (e.key === 'Escape') {
      close();
    }
  }

  onMount(() => {
    onCleanup(() => clearTimeout(debounceTimer));
  });

  const hasResults = () => {
    const r = results();
    return r.products.length > 0 || r.collections.length > 0 || r.pages.length > 0;
  };

  return (
    <div class="relative">
      {/* Search icon button — SSR-rendered */}
      <button
        class="flex items-center px-3 py-2 text-gray-600 hover:text-primary transition-colors"
        onClick={open}
        aria-label="Search"
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
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>

      {/* Backdrop */}
      <Show when={isOpen()}>
        <div class="fixed inset-0 bg-black/40 z-40" onClick={close} />
      </Show>

      {/* Search overlay */}
      <Show when={isOpen()}>
        <div class="fixed inset-x-0 top-0 z-50 bg-white shadow-2xl max-w-2xl mx-auto mt-16 rounded-lg overflow-hidden">
          {/* Search input */}
          <div class="flex items-center border-b px-4 py-3">
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
              class="text-gray-400 shrink-0 mr-3"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              class="flex-1 text-base outline-none placeholder:text-gray-400"
              placeholder="Search products, collections, pages…"
              value={query()}
              onInput={onInput}
              onKeyDown={onKeyDown}
              role="combobox"
              aria-expanded={hasResults()}
              aria-controls="predictive-search-results"
              aria-autocomplete="list"
              aria-activedescendant={activeIndex() >= 0 ? `search-result-${activeIndex()}` : undefined}
            />
            <button class="p-1 text-gray-500 hover:text-gray-900 ml-2" onClick={close}>
              ✕
            </button>
          </div>

          {/* Results */}
          <div
            id="predictive-search-results"
            role="listbox"
            class="max-h-[60vh] overflow-y-auto"
          >
            <Show when={loading()}>
              <p class="px-4 py-6 text-center text-gray-400 text-sm">Searching…</p>
            </Show>

            <Show when={!loading() && query().trim() && !hasResults()}>
              <p class="px-4 py-6 text-center text-gray-400 text-sm">No results found.</p>
            </Show>

            <Show when={!loading() && hasResults()}>
              {/* Products */}
              <Show when={results().products.length > 0}>
                <div class="px-4 pt-3 pb-1">
                  <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Products</h3>
                </div>
                <For each={results().products}>
                  {(product, idx) => {
                    const globalIdx = () => idx();
                    return (
                      <a
                        id={`search-result-${globalIdx()}`}
                        href={product.url}
                        class={`flex items-center gap-3 px-4 py-2 hover:bg-gray-50 transition-colors ${activeIndex() === globalIdx() ? 'bg-gray-100' : ''}`}
                        role="option"
                        aria-selected={activeIndex() === globalIdx()}
                      >
                        <Show when={product.image}>
                          <img
                            src={product.image!}
                            alt={product.title}
                            class="w-10 h-10 object-cover rounded"
                          />
                        </Show>
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-medium truncate">{product.title}</p>
                          <p class="text-xs text-gray-500">{product.price}</p>
                        </div>
                      </a>
                    );
                  }}
                </For>
              </Show>

              {/* Collections */}
              <Show when={results().collections.length > 0}>
                <div class="px-4 pt-3 pb-1">
                  <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Collections</h3>
                </div>
                <For each={results().collections}>
                  {(collection, idx) => {
                    const globalIdx = () => results().products.length + idx();
                    return (
                      <a
                        id={`search-result-${globalIdx()}`}
                        href={collection.url}
                        class={`block px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${activeIndex() === globalIdx() ? 'bg-gray-100' : ''}`}
                        role="option"
                        aria-selected={activeIndex() === globalIdx()}
                      >
                        {collection.title}
                      </a>
                    );
                  }}
                </For>
              </Show>

              {/* Pages */}
              <Show when={results().pages.length > 0}>
                <div class="px-4 pt-3 pb-1">
                  <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pages</h3>
                </div>
                <For each={results().pages}>
                  {(page, idx) => {
                    const globalIdx = () => results().products.length + results().collections.length + idx();
                    return (
                      <a
                        id={`search-result-${globalIdx()}`}
                        href={page.url}
                        class={`block px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${activeIndex() === globalIdx() ? 'bg-gray-100' : ''}`}
                        role="option"
                        aria-selected={activeIndex() === globalIdx()}
                      >
                        {page.title}
                      </a>
                    );
                  }}
                </For>
              </Show>

              {/* View all results link */}
              <a
                href={`${searchUrl}?q=${encodeURIComponent(query())}`}
                class="block px-4 py-3 text-sm text-center font-medium text-primary hover:bg-gray-50 border-t"
              >
                View all results
              </a>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
