/**
 * hydration.ts
 *
 * Phase 6: Hydration Loader
 *
 * Provides utilities for detecting interactive SolidJS components and
 * generating the hydration entry point for client-side island hydration.
 */

import { parseSync } from 'oxc-parser';
import {
  walkAst,
  isIdentifier,
  isJSXAttribute,
  isJSXIdentifier,
  isJSXExpressionContainer,
  isFunctionLike,
  type AstNode,
} from './ast-utils.js';
import type { TapMapping } from './tap-extract.js';
import { stripLiquidBraces } from './control-flow.js';

/**
 * Returns true if the component source is interactive:
 * - Uses createSignal or createEffect (SolidJS reactive primitives)
 * - Has any on* JSX event handler attributes (onClick, onChange, etc.)
 * - Uses tapWhen() (reactive tap — implies createTapSignal at runtime)
 */
export function isInteractiveComponent(source: string): boolean {
  if (/\bcreateSignal\b|\bcreateEffect\b/.test(source)) return true;
  if (/\bon[A-Z][a-zA-Z]*\s*=\s*\{/.test(source)) return true;
  if (/\btapWhen\b/.test(source)) return true;
  if (/\btapRemote\b/.test(source)) return true;
  if (/\btapPersonalized\b/.test(source)) return true;
  return false;
}

/**
 * Finds tap-mapped variable names that are used inside event handler
 * function bodies. These are the variables the JS bundle needs at
 * runtime (e.g. the product handle to call Shopify's cart API).
 *
 * Walks on* JSX attribute values and the bodies of any named functions
 * they reference, collecting identifier names that are keys in `mappings`.
 */
export function detectPropVars(source: string, mappings: TapMapping): string[] {
  const { program, errors } = parseSync('component.tsx', source);
  if (errors.length > 0) return [];

  // Step 1: Collect all on* JSX attribute value expressions
  const handlerExprs: AstNode[] = [];
  walkAst(program, (node) => {
    if (!isJSXAttribute(node)) return;
    const nameNode = node.name as AstNode;
    if (!isJSXIdentifier(nameNode)) return;
    const attrName = (nameNode as AstNode & { name: string }).name;
    // Must be on* with an uppercase third character (onClick, not 'on' alone)
    if (attrName.length < 3) return;
    if (!attrName.startsWith('on')) return;
    if (attrName[2] !== attrName[2].toUpperCase()) return;
    const value = node.value as AstNode | null;
    if (value && isJSXExpressionContainer(value)) {
      handlerExprs.push(value.expression as AstNode);
    }
  });

  if (handlerExprs.length === 0) return [];

  // Step 2: Build a map of function name → AST node for named functions
  const namedFuncNodes = new Map<string, AstNode>();
  walkAst(program, (node) => {
    // async function addToCart() { ... }
    if (node.type === 'FunctionDeclaration' && node.id) {
      const name = (node.id as AstNode & { name: string }).name;
      namedFuncNodes.set(name, node as AstNode);
      return;
    }
    // const addToCart = () => { ... }  or  const addToCart = function() { ... }
    if (
      node.type === 'VariableDeclarator' &&
      node.id &&
      isIdentifier(node.id as AstNode) &&
      node.init &&
      isFunctionLike(node.init as AstNode)
    ) {
      const name = (node.id as AstNode & { name: string }).name;
      namedFuncNodes.set(name, node.init as AstNode);
    }
  });

  // Step 3: Determine which AST nodes to search for mapping identifiers
  const nodesToSearch: AstNode[] = [];
  for (const expr of handlerExprs) {
    if (isIdentifier(expr)) {
      // onClick={addToCart} → search the named function body
      const funcNode = namedFuncNodes.get((expr as AstNode & { name: string }).name);
      if (funcNode) nodesToSearch.push(funcNode);
    } else if (isFunctionLike(expr)) {
      // onClick={() => doThing(handle)} → search the inline function
      nodesToSearch.push(expr);
    }
  }

  // Step 4: Walk the collected nodes, collect tap-mapped identifiers
  const result = new Set<string>();
  for (const node of nodesToSearch) {
    walkAst(node, (n) => {
      if (isIdentifier(n)) {
        const name = (n as AstNode & { name: string }).name;
        if (mappings[name]) result.add(name);
      }
    });
  }

  return [...result];
}

/**
 * Builds the data-props attribute value for a hydrated component.
 *
 * Each tap-mapped prop is serialized with the | json Liquid filter so
 * the server-rendered value is available to the client JS bundle.
 *
 * Example output for propVars = ['handle']:
 *   { "handle": {{ product.handle | json }} }
 */
export function generateDataProps(propVars: string[], mappings: TapMapping): string {
  if (propVars.length === 0) return '{}';

  const entries = propVars.map((varName) => {
    const liquidExpr = mappings[varName];
    const bare = stripLiquidBraces(liquidExpr);
    return `"${varName}": {{ ${bare} | json }}`;
  });

  return `{ ${entries.join(', ')} }`;
}

/**
 * Generates the content of a `sections/{name}-data.liquid` file.
 *
 * The section outputs a <script type="application/json"> tag whose content
 * is a JSON object mapping each tap-mapped variable name to its Liquid-rendered
 * value (with the | json filter applied for safe serialisation).
 *
 * Fetched at runtime via: GET {route}?section_id={name}-data
 * Shopify wraps the output in <div id="shopify-section-{name}-data">...</div>;
 * the runtime's fetchSectionData() extracts the script tag content.
 *
 * Example output for mappings = { price: '{{ product.price | money }}', available: '{{ product.available }}' }:
 *
 *   <script type="application/json">
 *   {
 *     "price": {{ product.price | money | json }},
 *     "available": {{ product.available | json }}
 *   }
 *   </script>
 */
export function generateDataSection(propVars: string[], mappings: TapMapping): string {
  const entries = propVars.map((varName) => {
    const liquidExpr = mappings[varName];
    const bare = stripLiquidBraces(liquidExpr);
    return `  "${varName}": {{ ${bare} | json }}`;
  });

  return [
    '<script type="application/json">',
    '{',
    entries.join(',\n'),
    '}',
    '</script>',
    '',
  ].join('\n');
}

/**
 * Generates the content of `assets/theme.entry.js` — the Shopify theme
 * entry script that mounts interactive components on the client.
 *
 * Uses SolidJS's render() (not hydrate()) because the DOM was produced by
 * Shopify Liquid, not SolidJS's renderToString(). hydrate() requires
 * SolidJS hydration markers that Liquid never emits; render() mounts fresh.
 */
export function generateHydrationEntry(
  components: Array<{ name: string; importPath: string }>,
): string {
  if (components.length === 0) {
    return '// No interactive components.\n';
  }

  const registryEntries = components
    .map((c) => `  '${c.name}': () => import('${c.importPath}'),`)
    .join('\n');

  return [
    `// Generated by Semi-Solid — do not edit.`,
    `import { render } from 'solid-js/web';`,
    ``,
    `const registry = {`,
    registryEntries,
    `};`,
    ``,
    `document.querySelectorAll('[data-component]').forEach(async (el) => {`,
    `  const name = el.getAttribute('data-component');`,
    `  if (!registry[name]) return;`,
    `  const props = JSON.parse(el.getAttribute('data-props') || '{}');`,
    `  const { default: Component } = await registry[name]();`,
    `  render(() => Component(props), el);`,
    `});`,
    ``,
  ].join('\n');
}
