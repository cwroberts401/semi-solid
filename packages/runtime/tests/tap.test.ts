import { describe, it, expect } from 'vitest';
import { tap, tapRemote, tapPersonalized, filter } from '../src/tap';
import { t, setTranslations } from '../src/t';

describe('tap()', () => {
  it('returns the fallback string', () => {
    expect(tap('{{ product.title }}', 'Default Title')).toBe('Default Title');
  });

  it('returns the fallback for boolean', () => {
    expect(tap('{{ product.available }}', true)).toBe(true);
    expect(tap('{{ product.available }}', false)).toBe(false);
  });

  it('returns the fallback for number', () => {
    expect(tap('{{ product.price }}', 0)).toBe(0);
    expect(tap('{{ product.price }}', 2500)).toBe(2500);
  });

  it('returns the fallback for string with liquid filters', () => {
    expect(tap('{{ product.price | money }}', '$0.00')).toBe('$0.00');
    expect(tap('{{ product.featured_image | img_url: "600x" }}', '/placeholder.jpg')).toBe('/placeholder.jpg');
  });

  it('returns the fallback for object', () => {
    const mock = { id: 1, title: 'Test' };
    expect(tap('product', mock)).toBe(mock);
  });

  it('returns the fallback for null/undefined', () => {
    expect(tap('{{ product.title }}', null)).toBe(null);
    expect(tap('{{ product.title }}', undefined)).toBe(undefined);
  });

  it('ignores the liquid expression entirely', () => {
    // The liquid expression is never evaluated — any string is valid
    expect(tap('not even valid liquid', 42)).toBe(42);
    expect(tap('', 'fallback')).toBe('fallback');
  });
});

describe('tapRemote()', () => {
  it('returns an empty string (stub)', () => {
    const result = tapRemote({}, '/products/x');
    expect(result).toBe('');
  });

  it('accepts any component reference as first arg', () => {
    function FakeComponent() { return null; }
    expect(tapRemote(FakeComponent, '/some-url')).toBe('');
  });
});

describe('tapPersonalized()', () => {
  it('returns an accessor yielding the fallback', () => {
    const result = tapPersonalized('/api/recs', { customerId: '123' }, []);
    expect(typeof result).toBe('function');
    expect(result()).toEqual([]);
  });

  it('ignores URL and params', () => {
    const fallback = { items: ['a', 'b'] };
    const result = tapPersonalized('https://api.example.com/data', { x: 1, y: 2 }, fallback);
    expect(result()).toBe(fallback);
  });

  it('returns a stable accessor reference', () => {
    const result = tapPersonalized('/api/test', {}, 'default');
    expect(result()).toBe('default');
    expect(result()).toBe('default');
  });
});

describe('filter()', () => {
  it('returns value unchanged', () => {
    expect(filter('hello', 'upcase')).toBe('hello');
  });

  it('returns value unchanged with args', () => {
    expect(filter('/image.jpg', 'image_url', { width: 800 })).toBe('/image.jpg');
  });

  it('preserves type through chaining', () => {
    const result = filter(filter(42, 'money'), 'strip_html');
    expect(result).toBe(42);
  });
});

describe('t()', () => {
  it('returns the key when no translations are set', () => {
    expect(t('product.add_to_cart')).toBe('product.add_to_cart');
  });

  it('returns the fallback when key is missing', () => {
    expect(t('product.missing_key', 'Add to Cart')).toBe('Add to Cart');
  });

  it('resolves nested keys from translations', () => {
    setTranslations({
      product: {
        add_to_cart: 'Add to Cart',
        sold_out: 'Sold Out',
      },
      cart: {
        title: 'Your Cart',
      },
    });

    expect(t('product.add_to_cart')).toBe('Add to Cart');
    expect(t('product.sold_out')).toBe('Sold Out');
    expect(t('cart.title')).toBe('Your Cart');
  });

  it('falls back to key for missing nested path', () => {
    setTranslations({ product: { add_to_cart: 'Add to Cart' } });
    expect(t('product.missing')).toBe('product.missing');
    expect(t('totally.missing.key')).toBe('totally.missing.key');
  });
});
