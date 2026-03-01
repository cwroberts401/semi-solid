/**
 * tapRemote runtime implementation.
 *
 * The compiler replaces every `tapRemote(Component, url)` call with
 * `__tapRemoteHtml("remote-{kebab-name}", url)`. This function creates a
 * SolidJS signal, fetches the rendered section HTML from the given URL via
 * the Shopify Section Rendering API, and returns an accessor for raw HTML
 * injection.
 *
 * If `url` is a reactive accessor (function), the section is re-fetched
 * whenever the URL changes.
 */

import { createSignal, createEffect, on } from 'solid-js';
import type { Accessor } from 'solid-js';

async function fetchSection(sectionName: string, url: string): Promise<string> {
  const target = new URL(url, window.location.origin);
  target.searchParams.set('section_id', sectionName);
  const html = await fetch(target.toString()).then((r) => r.text());
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const wrapper = doc.querySelector('[id^="shopify-section-"]');
  return wrapper?.innerHTML ?? html;
}

export function __tapRemoteHtml(
  sectionName: string,
  url: string | Accessor<string>,
): Accessor<string> {
  const [html, setHtml] = createSignal('');

  if (typeof url === 'function') {
    // Reactive URL — re-fetch whenever it changes
    createEffect(
      on(url, async (currentUrl) => {
        try {
          const result = await fetchSection(sectionName, currentUrl);
          setHtml(() => result);
        } catch (e) {
          console.error(`[tapRemote] failed to fetch "${sectionName}":`, e);
        }
      }),
    );
  } else {
    // Static URL — fire-and-forget fetch
    fetchSection(sectionName, url).then(
      (result) => setHtml(() => result),
      (e) => console.error(`[tapRemote] failed to fetch "${sectionName}":`, e),
    );
  }

  return html;
}
