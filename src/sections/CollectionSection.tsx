/**
 * CollectionSection — Shopify section for the collection listing page.
 *
 * Exported `schema` makes this a section (sections/collection-section.liquid).
 * Merchants can toggle and reorder blocks in the Theme Customizer.
 *
 * Blocks:
 *   header          — collection title + description banner
 *   toolbar         — active filter chips, product count, sort dropdown
 *   filter_and_grid — filter sidebar + product grid
 *   pagination      — paginate links
 *
 * Client-side JS uses event delegation on the Shopify section wrapper
 * so listeners survive Section Rendering API innerHTML replacements.
 */

import { For, Show, onMount, onCleanup } from 'solid-js';
import { tap, blockAttrs, filter, liquidRaw } from '$lib/runtime';
import { t } from '$lib/i18n';

interface CollectionProduct {
  title: string;
  url: string;
  featured_image: { src: string; alt: string };
  /** Raw price in store currency — apply | money filter in production Liquid */
  price: number;
  vendor: string;
  available: boolean;
}

interface FilterValue {
  label: string;
  count: number;
  active: boolean;
  url_to_add: string;
  url_to_remove: string;
}

interface CollectionFilter {
  label: string;
  type: string;
  values: FilterValue[];
  active_values: FilterValue[];
  min_value: { value: number };
  max_value: { value: number };
  range_max: number;
}

interface SortOption {
  name: string;
  value: string;
}

export const schema = {
  name: 'Collection',
  settings: [
    {
      type: 'range',
      id: 'products_per_page',
      label: 'Products per page',
      min: 4,
      max: 48,
      step: 4,
      default: 16,
    },
    {
      type: 'checkbox',
      id: 'enable_filtering',
      label: 'Enable filtering',
      default: true,
    },
    {
      type: 'checkbox',
      id: 'enable_sorting',
      label: 'Enable sorting',
      default: true,
    },
  ],
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
      type: 'toolbar',
      name: 'Toolbar',
      limit: 1,
      settings: [],
    },
    {
      type: 'filter_and_grid',
      name: 'Filters & product grid',
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
    {
      type: 'pagination',
      name: 'Pagination',
      limit: 1,
      settings: [],
    },
  ],
  presets: [
    {
      name: 'Collection',
      blocks: [
        { type: 'header' },
        { type: 'toolbar' },
        { type: 'filter_and_grid' },
        { type: 'pagination' },
      ],
    },
  ],
} as const;

export default function CollectionSection() {
  const blocks = tap('{{ section.blocks }}', [] as Array<{ type: string }>);
  const title = tap('{{ collection.title }}', '');
  const description = tap('{{ collection.description }}', '');
  const products = tap('{{ collection.products }}', [] as CollectionProduct[]);
  const collectionUrl = tap('{{ collection.url }}', '');
  const filters = tap('{{ collection.filters }}', [] as CollectionFilter[]);
  const sortOptions = tap('{{ collection.sort_options }}', [] as SortOption[]);
  const productsCount = tap('{{ collection.products_count }}', 0);
  const enableFiltering = tap('{{ section.settings.enable_filtering }}', true);
  const enableSorting = tap('{{ section.settings.enable_sorting }}', true);

  onMount(() => {
    const rootEl = document.querySelector('[data-collection-section]');
    if (!rootEl) return;
    const sectionEl = rootEl.closest('[id^="shopify-section-"]') as HTMLElement | null;
    if (!sectionEl) return;
    const sectionId = sectionEl.id.replace('shopify-section-', '');

    function fetchAndSwap(url: string) {
      const fetchUrl = new URL(url, window.location.origin);
      fetchUrl.searchParams.set('section_id', sectionId);
      fetch(fetchUrl.toString())
        .then((res) => res.text())
        .then((html) => {
          sectionEl!.innerHTML = html;
        });
    }

    function handleFilterSortChange(url: string) {
      history.pushState(null, '', url);
      fetchAndSwap(url);
    }

    // Click: filter buttons, pagination links, mobile filter toggle
    sectionEl.addEventListener('click', (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      const filterBtn = target.closest<HTMLElement>('[data-filter-url]');
      if (filterBtn) {
        e.preventDefault();
        handleFilterSortChange(filterBtn.dataset.filterUrl!);
        return;
      }

      const pageLink = target.closest<HTMLAnchorElement>('.pagination a');
      if (pageLink) {
        e.preventDefault();
        handleFilterSortChange(pageLink.href);
        return;
      }

      if (target.closest('[data-filter-toggle]')) {
        const panel = sectionEl!.querySelector('[data-filter-panel]');
        panel?.classList.toggle('hidden');
      }
    });

    // Change: sort select
    sectionEl.addEventListener('change', (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.matches('[data-sort-select]')) {
        const url = new URL(window.location.href);
        url.searchParams.set('sort_by', (target as HTMLSelectElement).value);
        handleFilterSortChange(url.toString());
      }
    });

    // Input: price range with debounce
    let priceTimer: ReturnType<typeof setTimeout>;
    sectionEl.addEventListener('input', (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-price-range]')) {
        clearTimeout(priceTimer);
        priceTimer = setTimeout(() => {
          const container = target.closest('[data-price-range]')!;
          const url = new URL(window.location.href);
          const minInput = container.querySelector<HTMLInputElement>('[name="filter.v.price.gte"]');
          const maxInput = container.querySelector<HTMLInputElement>('[name="filter.v.price.lte"]');
          if (minInput?.value) url.searchParams.set('filter.v.price.gte', minInput.value);
          else url.searchParams.delete('filter.v.price.gte');
          if (maxInput?.value) url.searchParams.set('filter.v.price.lte', maxInput.value);
          else url.searchParams.delete('filter.v.price.lte');
          handleFilterSortChange(url.toString());
        }, 500);
      }
    });

    // Browser back/forward
    function onPopState() {
      fetchAndSwap(window.location.href);
    }
    window.addEventListener('popstate', onPopState);
    onCleanup(() => window.removeEventListener('popstate', onPopState));
  });

  return (
    <div data-collection-section class="collection-section max-w-7xl mx-auto px-4 py-8">
      {liquidRaw('{% paginate collection.products by section.settings.products_per_page %}')}

      <For each={blocks}>
        {(block) => (
          <Match on={block.type}>
            {/* ── Header ── */}
            <Case value="header">
              <div {...blockAttrs()} class="collection-header mb-8 border-b pb-6">
                <h1 class="text-4xl font-bold text-primary">{title}</h1>
                <div class="prose mt-4 text-gray-600">{description}</div>
              </div>
            </Case>

            {/* ── Toolbar: active chips + count + sort ── */}
            <Case value="toolbar">
              <div {...blockAttrs()} class="toolbar flex flex-wrap items-center justify-between gap-4 mb-6">
                <div class="flex flex-wrap items-center gap-2">
                  <Show when={enableFiltering}>
                    <For each={filters}>
                      {(filterGroup) => (
                        <For each={filterGroup.active_values}>
                          {(val) => (
                            <button
                              data-filter-url={val.url_to_remove}
                              class="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-sm rounded-full hover:bg-gray-200 transition-colors"
                            >
                              {filterGroup.label}: {val.label}
                              <span aria-hidden="true">&times;</span>
                            </button>
                          )}
                        </For>
                      )}
                    </For>
                    {liquidRaw('{% assign has_active_filters = false %}{% for f in collection.filters %}{% if f.active_values.size > 0 %}{% assign has_active_filters = true %}{% endif %}{% endfor %}')}
                    {liquidRaw('{% if has_active_filters %}')}
                    <a
                      href={collectionUrl}
                      class="text-sm text-gray-500 underline hover:text-primary"
                    >
                      {t('collection.clear_all')}
                    </a>
                    {liquidRaw('{% endif %}')}
                  </Show>
                </div>

                <div class="flex items-center gap-4">
                  <span class="text-sm text-gray-500">
                    {productsCount} {t('collection.products_count')}
                  </span>
                  <Show when={enableSorting}>
                    {liquidRaw('<select data-sort-select class="border rounded px-3 py-1.5 text-sm bg-white">{% for option in collection.sort_options %}<option value="{{ option.value }}"{% if collection.sort_by == option.value %} selected{% endif %}>{{ option.name }}</option>{% endfor %}</select>')}
                  </Show>
                </div>
              </div>
            </Case>

            {/* ── Filters & product grid ── */}
            <Case value="filter_and_grid">
              <div {...blockAttrs()} class="filter-and-grid">
                {/* Mobile filter toggle */}
                <Show when={enableFiltering}>
                  <button
                    data-filter-toggle
                    class="md:hidden flex items-center gap-2 mb-4 px-4 py-2 border rounded text-sm font-medium"
                  >
                    {t('collection.filter_button')}
                  </button>
                </Show>

                <div class="md:flex md:gap-8">
                  {/* Filter sidebar */}
                  <Show when={enableFiltering}>
                    <aside data-filter-panel class="hidden md:block md:w-64 md:flex-shrink-0 mb-6 md:mb-0">
                      <For each={filters}>
                        {(filterGroup) => (
                          <div class="filter-group mb-6">
                            <h3 class="font-semibold text-sm mb-3">{filterGroup.label}</h3>
                            <Match on={filterGroup.type}>
                              <Case value="list">
                                <ul class="space-y-1">
                                  <For each={filterGroup.values}>
                                    {(val) => (
                                      <li>
                                        <Show
                                          when={val.active}
                                          fallback={
                                            <button
                                              data-filter-url={val.url_to_add}
                                              class="text-sm text-gray-600 hover:text-primary transition-colors"
                                            >
                                              {val.label} ({val.count})
                                            </button>
                                          }
                                        >
                                          <button
                                            data-filter-url={val.url_to_remove}
                                            class="text-sm font-semibold text-primary"
                                          >
                                            {val.label} ({val.count})
                                            <span aria-hidden="true"> &times;</span>
                                          </button>
                                        </Show>
                                      </li>
                                    )}
                                  </For>
                                </ul>
                              </Case>

                              <Case value="price_range">
                                <div data-price-range class="flex items-center gap-2">
                                  <input
                                    type="number"
                                    name="filter.v.price.gte"
                                    placeholder={t('collection.price_min')}
                                    value={filterGroup.min_value.value}
                                    min="0"
                                    class="w-24 border rounded px-2 py-1.5 text-sm"
                                  />
                                  <span class="text-gray-400">&ndash;</span>
                                  <input
                                    type="number"
                                    name="filter.v.price.lte"
                                    placeholder={t('collection.price_max')}
                                    value={filterGroup.max_value.value}
                                    min="0"
                                    class="w-24 border rounded px-2 py-1.5 text-sm"
                                  />
                                </div>
                              </Case>

                              <Case value="boolean">
                                <For each={filterGroup.values}>
                                  {(val) => (
                                    <Show
                                      when={val.active}
                                      fallback={
                                        <button
                                          data-filter-url={val.url_to_add}
                                          class="text-sm text-gray-600 hover:text-primary transition-colors"
                                        >
                                          {val.label}
                                        </button>
                                      }
                                    >
                                      <button
                                        data-filter-url={val.url_to_remove}
                                        class="text-sm font-semibold text-primary"
                                      >
                                        {val.label}
                                        <span aria-hidden="true"> &times;</span>
                                      </button>
                                    </Show>
                                  )}
                                </For>
                              </Case>
                            </Match>
                          </div>
                        )}
                      </For>
                    </aside>
                  </Show>

                  {/* Product grid */}
                  <div class="flex-1">
                    {liquidRaw('{% if collection.products.size == 0 %}')}
                    <p class="text-center text-gray-500 py-12">{t('collection.no_products')}</p>
                    {liquidRaw('{% else %}')}
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
                    {liquidRaw('{% endif %}')}
                  </div>
                </div>
              </div>
            </Case>

            {/* ── Pagination ── */}
            <Case value="pagination">
              <div {...blockAttrs()} class="pagination mt-12 text-center">
                {liquidRaw('{{ paginate | default_pagination }}')}
              </div>
            </Case>
          </Match>
        )}
      </For>

      {liquidRaw('{% endpaginate %}')}
    </div>
  );
}
