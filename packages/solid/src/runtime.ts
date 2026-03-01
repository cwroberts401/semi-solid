// Re-export from the workspace runtime package.
// Components import from '$lib/runtime' via the Vite alias.
export { tap, tapWhen, liquidRaw, blockAttrs, tapRemote, tapPersonalized } from '@semi-solid/runtime';
// createTapSignal is the compiler-emitted replacement for tapWhen() calls.
// It lives in src/lib/ (not packages/runtime) because it depends on solid-js.
export { createTapSignal } from './tapWhen.js';
// __tapRemoteHtml is the compiler-emitted replacement for tapRemote() calls.
export { __tapRemoteHtml } from './tapRemote.js';
// createPersonalizedSignal is the compiler-emitted replacement for tapPersonalized() calls.
export { createPersonalizedSignal } from './tapPersonalized.js';
// createStore — localStorage-backed reactive store.
export { createStore } from './store.js';
