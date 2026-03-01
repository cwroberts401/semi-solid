/**
 * IndexContent — Shopify section for the home page.
 *
 * Exported `schema` makes this a section (sections/index-content.liquid)
 * rather than a snippet. Referenced by templates/index.json.
 */

import { tap } from '$lib/runtime';
import { t } from '$lib/i18n';
import ProductCard from '$snippets/ProductCard';

export const schema = {
  name: 'Index Content',
  tag: 'div',
  class: 'section-index-content',
  settings: [],
  presets: [
    {
      name: 'Index Content',
    },
  ],
} as const;

export default function IndexContent() {
  const shopName = tap('{{ shop.name }}', 'My Store');

  return (
    <div class="space-y-16">
      <section class="text-center py-16 bg-gray-50 rounded-xl">
        <h1 class="text-4xl font-bold text-primary mb-4">{shopName}</h1>
        <p class="text-lg text-gray-600 mb-8">{t('home.tagline')}</p>
        <a href="/collections/all" class="inline-block bg-primary text-white px-8 py-3 rounded hover:bg-accent transition-colors">
          {t('home.shop_now')}
        </a>
      </section>

      <section>
        <h2 class="text-2xl font-semibold mb-8">{t('home.featured_products')}</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <ProductCard />
        </div>
      </section>
    </div>
  );
}
