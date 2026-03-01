/**
 * createStore — a localStorage-backed reactive store using SolidJS signals.
 *
 * Useful for recently viewed items, wishlists, and other client-side
 * persistence that should survive page navigations and browser restarts.
 */

import { createSignal } from 'solid-js';
import type { Accessor } from 'solid-js';

export interface StoreOptions {
  /** Maximum number of items to keep. Default: 20 */
  maxItems?: number;
}

export interface PersistentStore<T> {
  items: Accessor<T[]>;
  add: (item: T) => void;
  remove: (item: T) => void;
  clear: () => void;
}

function readStorage<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

function writeStorage<T>(key: string, value: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // SSR or quota exceeded — silently ignore
  }
}

export function createStore<T>(key: string, options?: StoreOptions): PersistentStore<T> {
  const maxItems = options?.maxItems ?? 20;
  const initial = readStorage<T>(key);
  const [items, setItems] = createSignal<T[]>(initial);

  function persist(next: T[]): void {
    setItems(() => next);
    writeStorage(key, next);
  }

  function add(item: T): void {
    const serialised = JSON.stringify(item);
    const deduped = items().filter((existing) => JSON.stringify(existing) !== serialised);
    const next = [item, ...deduped].slice(0, maxItems);
    persist(next);
  }

  function remove(item: T): void {
    const serialised = JSON.stringify(item);
    const next = items().filter((existing) => JSON.stringify(existing) !== serialised);
    persist(next);
  }

  function clear(): void {
    persist([]);
  }

  return { items, add, remove, clear };
}
