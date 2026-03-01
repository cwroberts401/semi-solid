/**
 * tapPersonalized runtime implementation.
 *
 * The compiler replaces every `tapPersonalized(url, params, fallback)` call with
 * `createPersonalizedSignal(url, params, fallback)`. This function creates a
 * SolidJS signal, fetches personalized data from the external API, and returns
 * an accessor.
 *
 * The compiler also generates:
 *   - <link rel="preconnect"> for the external domain
 *   - An inline <script> that starts the fetch early (prefetch), storing the
 *     promise on window.__p[url] so this runtime can pick it up without
 *     duplicating the request.
 */

import { createSignal, createEffect, on } from 'solid-js';
import type { Accessor } from 'solid-js';

// ---------------------------------------------------------------------------
// Module-level base URL context
// Set by the hydration entry; captured by createPersonalizedSignal.
// ---------------------------------------------------------------------------

let _personalizedBaseUrl: string | undefined;

export function __setPersonalizationBaseUrl(url: string | undefined): void {
  _personalizedBaseUrl = url;
}

// ---------------------------------------------------------------------------
// URL building
// ---------------------------------------------------------------------------

/**
 * Builds a full URL from the endpoint and params.
 * - Resolves relative URLs against _personalizedBaseUrl
 * - Sorts param keys alphabetically (deterministic cache key matching with prefetch)
 * - Builds query string with encodeURIComponent
 */
export function buildUrl(
  endpoint: string,
  params: Record<string, unknown>,
): string {
  // Resolve relative endpoints against base URL
  let base: string;
  if (/^https?:\/\//.test(endpoint)) {
    base = endpoint;
  } else {
    const origin = _personalizedBaseUrl ?? '';
    // Ensure no double slashes
    base = origin.replace(/\/$/, '') + '/' + endpoint.replace(/^\//, '');
  }

  const keys = Object.keys(params).sort();
  if (keys.length === 0) return base;

  const qs = keys
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k] ?? ''))}`)
    .join('&');

  return `${base}?${qs}`;
}

// ---------------------------------------------------------------------------
// createPersonalizedSignal — emitted by the compiler in place of tapPersonalized()
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    __p?: Record<string, Promise<unknown>>;
  }
}

/**
 * Creates a reactive signal for personalized data from an external API.
 *
 * 1. Checks window.__p[url] for a prefetched promise (started by the
 *    inline <head> script the compiler generates).
 * 2. If no prefetch, fires a fetch immediately.
 * 3. Sets up a deferred createEffect that re-fetches when any param
 *    signal changes.
 *
 * @param url     API endpoint URL
 * @param params  Named params — may contain signal accessors or plain values
 * @param initial Initial/fallback value
 */
export function createPersonalizedSignal<T>(
  url: string,
  params: Record<string, unknown>,
  initial: T,
): Accessor<T> {
  const [value, setValue] = createSignal<T>(initial);

  // Resolve current param values (some may be signal accessors)
  function resolveParams(): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params)) {
      resolved[k] = typeof v === 'function' ? (v as () => unknown)() : v;
    }
    return resolved;
  }

  async function fetchData(): Promise<void> {
    const resolved = resolveParams();
    const fullUrl = buildUrl(url, resolved);

    try {
      // Check for prefetched promise
      const prefetch = window.__p?.[fullUrl];
      let data: T;
      if (prefetch) {
        data = (await prefetch) as T;
        delete window.__p![fullUrl];
      } else {
        const res = await fetch(fullUrl);
        data = (await res.json()) as T;
      }
      setValue(() => data);
    } catch (e) {
      console.error(`[tapPersonalized] failed to fetch "${url}":`, e);
    }
  }

  // Find signal accessors among params for reactivity
  const accessors = Object.values(params).filter(
    (v): v is Accessor<unknown> => typeof v === 'function',
  );

  if (accessors.length > 0) {
    // Initial fetch + reactive re-fetch when deps change
    fetchData();
    createEffect(
      on(
        accessors,
        () => { fetchData(); },
        { defer: true },
      ),
    );
  } else {
    // No reactive params — single fire-and-forget fetch
    fetchData();
  }

  return value;
}
