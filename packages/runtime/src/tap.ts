/**
 * Bridges SolidJS and Liquid.
 *
 * At build time: the compiler extracts the liquidExpr and uses it
 * when generating .liquid files. The liquidExpr is a Liquid expression
 * string, e.g. '{{ product.title }}' or '{{ product.price | money }}'.
 *
 * At runtime (browser, tests, Storybook): returns the fallback value.
 * The liquidExpr is ignored entirely — it's just a string marker.
 *
 * @param liquidExpr - A Liquid expression, e.g. '{{ product.title }}'
 * @param fallback   - Default value used in browser, tests, Storybook
 * @returns The fallback value (runtime) or triggers Liquid generation (build)
 */
export function tap<T>(liquidExpr: string, fallback: T): T {
  return fallback;
}

/**
 * Reactive variant of tap() — the compiler replaces this call with
 * createTapSignal(key, deps, fallback) which re-fetches the value from a
 * generated JSON data section whenever any dep signal changes.
 *
 * At runtime (tests, Storybook — no compiler transform applied): returns a
 * stable accessor that always yields the fallback, matching the Accessor<T>
 * shape the compiler emits.
 *
 * @param liquidExpr - A Liquid expression, e.g. '{{ product.price | money }}'
 * @param deps       - Signal accessors whose changes trigger a section re-fetch
 * @param fallback   - Default value; also used as the initial signal value in browser
 */
export function tapWhen<T>(liquidExpr: string, deps: unknown[], fallback: T): () => T {
  void liquidExpr;
  void deps;
  return () => fallback;
}

/**
 * Returns an empty object at runtime; `{...blockAttrs()}` in JSX compiles to
 * `{{ block.shopify_attributes }}` in Liquid, enabling Shopify Theme Editor
 * drag-and-drop controls on section blocks.
 *
 * Usage:
 *   <div {...blockAttrs()} class="block-item">…</div>
 *
 * Generated Liquid:
 *   <div {{ block.shopify_attributes }} class="block-item">…</div>
 */
export function blockAttrs(): Record<string, never> {
  return {} as Record<string, never>;
}

/**
 * Compile-time marker that transforms into a Liquid filter expression.
 *
 * At build time: the compiler converts `filter(expr, 'filterName', { key: val })`
 * into `{{ expr | filterName: key: val }}` in the generated .liquid output.
 *
 * At runtime (browser, tests, Storybook): returns the value unchanged —
 * the filter only applies in compiled Liquid.
 *
 * Supports chaining: `filter(filter(price, 'money'), 'strip_html')`
 * → `{{ price | money | strip_html }}`
 *
 * @param value       - The value to filter (loop var, tap-mapped var, or nested filter())
 * @param _filterName - Liquid filter name, e.g. 'image_url', 'money'
 * @param _args       - Optional key-value arguments for the filter
 */
export function filter<T>(value: T, _filterName: string, _args?: Record<string, unknown>): T {
  return value;
}

/**
 * Injects a raw Liquid expression or tag directly into the compiled .liquid output.
 *
 * At build time: the compiler passes the liquidStr through unchanged into the
 * generated .liquid file. No {{ }} wrapping is added.
 *
 * At runtime (browser, tests, Storybook): returns an empty string — this is
 * server-side-only content that Liquid handles.
 *
 * Usage:
 *   {liquidRaw("{{ content_for_header }}")}   // Shopify head injection point
 *   {liquidRaw("{% render 'theme-assets' %}")} // CSS + JS includes snippet
 *   {liquidRaw("{% form 'product' %}...{% endform %}")} // Shopify form tags
 */
export function liquidRaw(liquidStr: string): string {
  void liquidStr;
  return '';
}

/**
 * Fetches rendered HTML of a component from a different URL via the Shopify
 * Section Rendering API. Returns an `Accessor<string>` for raw HTML injection.
 *
 * At build time: the compiler replaces this with `__tapRemoteHtml(sectionName, url)`.
 * At runtime (tests, Storybook — no compiler transform): returns an empty string.
 *
 * @param _Component - A component reference (e.g. ProductCard)
 * @param _url       - The URL to fetch the section from
 */
export function tapRemote<T>(_Component: T, _url: string): string {
  return '';
}

/**
 * Fetches personalized data from an external server.
 *
 * At build time: the compiler replaces this with `createPersonalizedSignal(url, params, fallback)`
 * which creates a SolidJS signal that fetches from the external API.
 *
 * At runtime (tests, Storybook — no compiler transform): returns a stable accessor
 * that always yields the fallback, matching the Accessor<T> shape the compiler emits.
 *
 * @param url      - The API endpoint URL (relative or absolute)
 * @param params   - Named parameters whose values are tap()-mapped variables
 * @param fallback - Default value; also used as the initial signal value in browser
 */
export function tapPersonalized<T>(url: string, params: Record<string, unknown>, fallback: T): () => T {
  void url;
  void params;
  return () => fallback;
}
