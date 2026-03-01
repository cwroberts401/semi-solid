import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage before importing the module under test
const storage = new Map<string, string>();
const localStorageMock = {
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
  removeItem: vi.fn((key: string) => storage.delete(key)),
  clear: vi.fn(() => storage.clear()),
  get length() { return storage.size; },
  key: vi.fn(() => null),
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// Mock solid-js createSignal
let signalValue: unknown[] = [];
const mockSetter = vi.fn((fn: unknown) => {
  if (typeof fn === 'function') {
    signalValue = (fn as () => unknown[])();
  } else {
    signalValue = fn as unknown[];
  }
});
const mockAccessor = vi.fn(() => signalValue);

vi.mock('solid-js', () => ({
  createSignal: vi.fn((initial: unknown) => {
    signalValue = initial as unknown[];
    return [mockAccessor, mockSetter];
  }),
}));

import { createStore } from '../src/store';

describe('createStore()', () => {
  beforeEach(() => {
    storage.clear();
    vi.clearAllMocks();
    signalValue = [];
  });

  it('initialises with empty array when localStorage is empty', () => {
    const store = createStore<string>('test-key');
    expect(store.items()).toEqual([]);
  });

  it('reads initial state from localStorage', () => {
    storage.set('test-key', JSON.stringify(['a', 'b']));
    const store = createStore<string>('test-key');
    expect(store.items()).toEqual(['a', 'b']);
  });

  it('adds an item and persists to localStorage', () => {
    const store = createStore<string>('test-key');
    store.add('item1');
    expect(store.items()).toContain('item1');
    expect(JSON.parse(storage.get('test-key')!)).toContain('item1');
  });

  it('prepends new items', () => {
    const store = createStore<string>('test-key');
    store.add('first');
    store.add('second');
    const items = store.items();
    expect(items[0]).toBe('second');
    expect(items[1]).toBe('first');
  });

  it('deduplicates items by JSON equality', () => {
    const store = createStore<{ id: number }>('test-key');
    store.add({ id: 1 });
    store.add({ id: 2 });
    store.add({ id: 1 }); // duplicate — should move to front, not duplicate
    const items = store.items();
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ id: 1 });
    expect(items[1]).toEqual({ id: 2 });
  });

  it('respects maxItems option', () => {
    const store = createStore<number>('test-key', { maxItems: 3 });
    store.add(1);
    store.add(2);
    store.add(3);
    store.add(4); // should push out 1
    const items = store.items();
    expect(items).toHaveLength(3);
    expect(items).toEqual([4, 3, 2]);
  });

  it('defaults maxItems to 20', () => {
    const store = createStore<number>('test-key');
    for (let i = 0; i < 25; i++) store.add(i);
    expect(store.items()).toHaveLength(20);
  });

  it('removes an item', () => {
    const store = createStore<string>('test-key');
    store.add('a');
    store.add('b');
    store.remove('a');
    expect(store.items()).toEqual(['b']);
    expect(JSON.parse(storage.get('test-key')!)).toEqual(['b']);
  });

  it('clears all items', () => {
    const store = createStore<string>('test-key');
    store.add('a');
    store.add('b');
    store.clear();
    expect(store.items()).toEqual([]);
    expect(JSON.parse(storage.get('test-key')!)).toEqual([]);
  });

  it('handles invalid JSON in localStorage gracefully', () => {
    storage.set('bad-key', 'not-json{{{');
    const store = createStore<string>('bad-key');
    expect(store.items()).toEqual([]);
  });
});
