/**
 * VariantSelector — product option dropdowns (size, colour, etc.).
 *
 * Liquid SSR output:
 *   {% for option in product.options_with_values %}
 *     <label>{{ option.name }}</label>
 *     <div><button>{{ option.values[0] }}</button></div>
 *   {% endfor %}
 *
 * The dropdown listbox is entirely client-side (gated by an isOpen signal).
 * Dispatches `variant:changed` CustomEvent with { variantId, available }.
 */

import { createSignal, For, Show, onMount, onCleanup } from 'solid-js';
import { tap } from '$lib/runtime';

interface ProductOption {
  name: string;
  values: string[];
}

interface ProductVariant {
  id: number;
  available: boolean;
  options: string[];
}

export default function VariantSelector(props: {
  options?: ProductOption[];
  variants?: ProductVariant[];
}) {
  const options = tap('{{ product.options_with_values }}', props.options ?? []) as ProductOption[];
  const variants = tap('{{ product.variants }}', props.variants ?? []) as ProductVariant[];

  const [selected, setSelected] = createSignal<string[]>(
    options.map((o) => o.values[0] ?? '')
  );
  const [openIdx, setOpenIdx] = createSignal<number | null>(null);
  const [focusIdx, setFocusIdx] = createSignal(-1);

  function dispatchVariant(opts: string[]) {
    const match = variants.find((v) => v.options.every((o, i) => o === opts[i]));
    if (match) {
      const url = new URL(window.location.href);
      url.searchParams.set('variant', String(match.id));
      history.replaceState(null, '', url.toString());

      window.dispatchEvent(
        new CustomEvent('variant:changed', {
          detail: { variantId: match.id, available: match.available },
        })
      );
    }
  }

  function selectOption(idx: number, value: string) {
    const next = selected().map((v, i) => (i === idx ? value : v));
    setSelected(next);
    dispatchVariant(next);
    setOpenIdx(null);
  }

  function toggle(idx: number) {
    if (openIdx() === idx) {
      setOpenIdx(null);
    } else {
      setOpenIdx(idx);
      const values = options[idx]?.values ?? [];
      setFocusIdx(values.indexOf(selected()[idx]));
    }
  }

  function onKeyDown(e: KeyboardEvent, optIdx: number, values: string[]) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusIdx((i) => (i < values.length - 1 ? i + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIdx((i) => (i > 0 ? i - 1 : values.length - 1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const idx = focusIdx();
      if (idx >= 0 && idx < values.length) {
        selectOption(optIdx, values[idx]);
      }
    } else if (e.key === 'Escape') {
      setOpenIdx(null);
    }
  }

  // Close on outside click
  onMount(() => {
    function handleClick(e: MouseEvent) {
      if (openIdx() !== null && !(e.target as HTMLElement).closest('[data-variant-dropdown]')) {
        setOpenIdx(null);
      }
    }
    document.addEventListener('click', handleClick);
    onCleanup(() => document.removeEventListener('click', handleClick));
  });

  return (
    <div class="space-y-4">
      <For each={options}>
        {(option, optionIdx) => (
          <div data-variant-dropdown class="relative">
            <label class="block text-sm font-medium text-gray-700 mb-1">{option.name}</label>
            <button
              class="w-full flex items-center justify-between border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-700 bg-white hover:border-primary focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
              onClick={() => toggle(optionIdx())}
              onKeyDown={(e) => {
                if (openIdx() === optionIdx()) {
                  onKeyDown(e, optionIdx(), option.values);
                } else if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggle(optionIdx());
                }
              }}
              role="combobox"
              aria-expanded={openIdx() === optionIdx()}
              aria-haspopup="listbox"
              aria-controls={`variant-listbox-${optionIdx()}`}
            >
              <span>{selected()[optionIdx()]}</span>
              <svg
                class={`w-4 h-4 text-gray-400 transition-transform ${openIdx() === optionIdx() ? 'rotate-180' : ''}`}
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                  clip-rule="evenodd"
                />
              </svg>
            </button>

            <Show when={openIdx() === optionIdx()}>
              <ul
                id={`variant-listbox-${optionIdx()}`}
                role="listbox"
                class="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto py-1"
              >
                <For each={option.values}>
                  {(value, valueIdx) => (
                    <li
                      role="option"
                      aria-selected={selected()[optionIdx()] === value}
                      class={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                        selected()[optionIdx()] === value
                          ? 'bg-primary/10 text-primary font-medium'
                          : focusIdx() === valueIdx()
                            ? 'bg-gray-100 text-gray-900'
                            : 'text-gray-700 hover:bg-gray-50'
                      }`}
                      onClick={() => selectOption(optionIdx(), value)}
                      onMouseEnter={() => setFocusIdx(valueIdx())}
                    >
                      {value}
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </div>
        )}
      </For>
    </div>
  );
}
