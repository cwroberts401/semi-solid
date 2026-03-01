/**
 * tapWhen runtime implementation.
 *
 * The compiler replaces every `tapWhen(liquidExpr, deps, fallback)` call with
 * `createTapSignal(key, deps, fallback)`. The key is the LHS variable name,
 * injected at compile time so the runtime knows which field to read from the
 * JSON data section response.
 *
 * The data section is a Shopify section that renders only a
 * <script type="application/json"> tag containing the component's tap-mapped
 * values serialised with the | json Liquid filter. It can be fetched via:
 *
 *   GET {any-route}?section_id={component-name}-data
 *
 * The currently-mounted component's section ID is communicated via a
 * module-level variable set by the hydration entry immediately before
 * calling render(). This is safe because render() is synchronous and
 * createTapSignal() captures the value in a closure at call time.
 */

import { createSignal, createEffect, on } from 'solid-js';
import type { Accessor } from 'solid-js';

// ---------------------------------------------------------------------------
// Module-level section ID context
// Set by the hydration entry just before render(); captured by createTapSignal.
// ---------------------------------------------------------------------------

let _activeSectionId: string | undefined;

export function __setSectionId(id: string | null | undefined): void {
  _activeSectionId = id ?? undefined;
}

// ---------------------------------------------------------------------------
// Data section fetching
// ---------------------------------------------------------------------------

async function fetchSectionData<T>(sectionId: string): Promise<T> {
  const url = new URL(
    window.location.pathname + window.location.search,
    window.location.origin,
  );
  url.searchParams.set('section_id', sectionId);
  const html = await fetch(url.toString()).then((r) => r.text());
  // Shopify wraps section output in <div id="shopify-section-{id}">...</div>.
  // Use DOMParser so <script type="application/json"> content is never
  // HTML-decoded, avoiding issues with < > & in JSON values.
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const script = doc.querySelector('script[type="application/json"]');
  return JSON.parse(script?.textContent ?? '{}') as T;
}

// ---------------------------------------------------------------------------
// createTapSignal — emitted by the compiler in place of tapWhen()
// ---------------------------------------------------------------------------

/**
 * Creates a reactive signal for a tap-mapped value.
 *
 * - Initialises the signal from `initial` (the prop value from data-props).
 * - Captures the active section ID at call time (synchronously set by the
 *   hydration entry before render()).
 * - Registers a deferred createEffect that re-fetches the data section
 *   whenever any dep changes and updates the signal.
 *
 * @param key     LHS variable name; used to index the JSON response.
 * @param deps    Signal accessors whose changes trigger a re-fetch.
 * @param initial Initial value, usually props.xxx from data-props.
 */
export function createTapSignal<T>(
  key: string,
  deps: Accessor<unknown>[],
  initial: T,
): Accessor<T> {
  const sectionId = _activeSectionId; // captured synchronously at mount time
  const [value, setValue] = createSignal<T>(initial);

  if (sectionId && deps.length > 0) {
    createEffect(
      on(
        deps,
        async () => {
          try {
            const data = await fetchSectionData<Record<string, unknown>>(sectionId);
            if (key in data) setValue(() => data[key] as T);
          } catch (e) {
            console.error(`[tapWhen] failed to refresh "${key}":`, e);
          }
        },
        { defer: true }, // skip initial run — data-props covers the first render
      ),
    );
  }

  return value;
}
