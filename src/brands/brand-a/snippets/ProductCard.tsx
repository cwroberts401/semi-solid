/**
 * brand-a ProductCard override.
 *
 * Extends the base product card with a sale badge and compare-price display.
 * When `$snippets/ProductCard` is imported and BRAND=brand-a, the brand
 * resolver routes here instead of src/snippets/ProductCard.tsx.
 *
 * Generated snippets/product-card.liquid for brand-a will include:
 *   - Sale badge ({% if product.compare_at_price > product.price %})
 *   - Strikethrough compare price alongside the sale price
 */

import { Show } from 'solid-js';
import { tap } from '$lib/runtime';
import { t } from '$lib/i18n';

interface ProductCardProps {
  title?: string;
  price?: string;
  comparePrice?: string;
  imageUrl?: string;
  available?: boolean;
}

export default function ProductCard(props: ProductCardProps) {
  const title = tap('{{ product.title }}', props.title ?? 'Product');
  const price = tap('{{ product.price | money }}', props.price ?? '$0.00');
  const comparePrice = tap('{{ product.compare_at_price | money }}', props.comparePrice ?? '');
  const imageUrl = tap("{{ product.featured_image | img_url: '600x' }}", props.imageUrl ?? '');
  const available = tap('{{ product.available }}', props.available ?? true);
  const onSale = tap('{{ product.compare_at_price > product.price }}', false);

  return (
    <div class="product-card product-card--brand-a">
      <div class="product-card__media">
        <img src={imageUrl} alt={title} loading="lazy" />
        <Show when={onSale}>
          <span class="product-card__badge">{t('product.sale')}</span>
        </Show>
      </div>
      <div class="product-card__body">
        <h2 class="product-card__title">{title}</h2>
        <div class="product-card__pricing">
          <span class="product-card__price">{price}</span>
          <Show when={onSale}>
            <s class="product-card__compare-price">{comparePrice}</s>
          </Show>
        </div>
      </div>
      <div class="product-card__actions">
        <Show
          when={available}
          fallback={<span class="product-card__sold-out">{t('product.sold_out')}</span>}
        >
          <button class="product-card__add-to-cart">{t('product.add_to_cart')}</button>
        </Show>
      </div>
    </div>
  );
}
