/**
 * control-flow.ts
 *
 * Utilities for resolving SolidJS control-flow components (<Show>, <For>)
 * to their Liquid equivalents.
 *
 * These functions operate on oxc-parser AST nodes and are consumed by
 * liquid-gen.ts during JSX → Liquid compilation.
 */

import { isIdentifier, isMemberExpression, isUnaryExpression, type AstNode } from './ast-utils.js';
import type { TapMapping } from './tap-extract.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ShowCondition {
  /** The bare Liquid expression, e.g. 'product.available' or 'item.in_stock' */
  liquidExpr: string;
  /**
   * When true, use {% unless %} / {% endunless %}.
   * Produced by <Show when={!condition}>.
   */
  negated: boolean;
}

export interface ForIteration {
  /** The Liquid collection expression, e.g. 'product.images' */
  collection: string;
  /** The loop variable name taken from the JSX render function param */
  loopVar: string;
}

// ---------------------------------------------------------------------------
// Resolvers
// ---------------------------------------------------------------------------

/**
 * Resolves the `when` expression from `<Show when={expr}>` to a Liquid condition.
 *
 * Returns null when the condition is purely client-side (e.g. a signal call,
 * a complex expression, or an identifier that is not tap()-mapped).
 *
 * Supported patterns:
 *   when={tapMapped}        → { liquidExpr: 'product.available', negated: false }
 *   when={!tapMapped}       → { liquidExpr: 'product.available', negated: true }
 *   when={loopVar}          → { liquidExpr: 'item', negated: false }
 *   when={loopVar.prop}     → { liquidExpr: 'item.in_stock', negated: false }
 *   when={!loopVar.prop}    → { liquidExpr: 'item.in_stock', negated: true }
 */
export function resolveShowCondition(
  whenExpr: AstNode,
  mappings: TapMapping,
  loopVars: Set<string>,
  warnings?: string[],
): ShowCondition | null {
  // Simple identifier: when={available}
  if (isIdentifier(whenExpr)) {
    const liquidStr = mappings[whenExpr.name];
    if (liquidStr) {
      if (hasLiquidFilters(liquidStr)) {
        warnings?.push(
          `<Show when={${whenExpr.name}}>: tap() expression '${liquidStr}' contains Liquid ` +
          `filters which are not valid in {% if %} tag context. Use a separate tap() without ` +
          `filters for conditions (e.g. tap('{{ product.available }}', false)). ` +
          `Falling back to client-side rendering.`,
        );
        return null;
      }
      return { liquidExpr: stripLiquidBraces(liquidStr), negated: false };
    }
    if (loopVars.has(whenExpr.name)) {
      return { liquidExpr: whenExpr.name, negated: false };
    }
    return null;
  }

  // Negated: when={!expr}  — recursively resolve the operand and flip negated
  if (isUnaryExpression(whenExpr) && whenExpr.operator === '!') {
    const inner = resolveShowCondition(whenExpr.argument, mappings, loopVars, warnings);
    if (inner) return { liquidExpr: inner.liquidExpr, negated: !inner.negated };
    return null;
  }

  // Member expression: when={item.available} (loop variable property access)
  const memberPath = resolveMemberPath(whenExpr, mappings, loopVars);
  if (memberPath && memberPath.includes('|')) {
    warnings?.push(
      `<Show when={...}>: resolved expression '${memberPath}' contains Liquid filters ` +
      `which are not valid in {% if %} tag context. Falling back to client-side rendering.`,
    );
    return null;
  }
  if (memberPath) return { liquidExpr: memberPath, negated: false };

  return null;
}

/**
 * Resolves the `each` expression from `<For each={expr}>` to a ForIteration.
 *
 * Returns null if the collection is not tap()-mapped (i.e. it's a purely
 * client-side array).
 *
 * @param eachExpr    The AST node for the `each` attribute value
 * @param loopVarName The render-function parameter name (the loop variable)
 * @param mappings    tap() mappings from the component
 */
export function resolveForIteration(
  eachExpr: AstNode,
  loopVarName: string,
  mappings: TapMapping,
  loopVars: Set<string> = new Set(),
  warnings?: string[],
): ForIteration | null {
  // Simple tap-mapped identifier: each={images}
  if (isIdentifier(eachExpr)) {
    const liquidStr = mappings[eachExpr.name];
    if (!liquidStr) return null;
    if (hasLiquidFilters(liquidStr)) {
      warnings?.push(
        `<For each={${eachExpr.name}}>: tap() expression '${liquidStr}' contains Liquid ` +
        `filters which are not valid in {% for %} tag context. Use a separate tap() without ` +
        `filters for collections. Falling back to client-side rendering.`,
      );
      return null;
    }
    return {
      collection: stripLiquidBraces(liquidStr),
      loopVar: loopVarName,
    };
  }

  // Member expression on a loop variable: each={link.links}
  // Delegates to resolveMemberPath which handles nested access on loop vars.
  if (isMemberExpression(eachExpr)) {
    const memberPath = resolveMemberPath(eachExpr, mappings, loopVars);
    if (memberPath && memberPath.includes('|')) {
      warnings?.push(
        `<For each={...}>: resolved expression '${memberPath}' contains Liquid filters ` +
        `which are not valid in {% for %} tag context. Falling back to client-side rendering.`,
      );
      return null;
    }
    if (memberPath) {
      return { collection: memberPath, loopVar: loopVarName };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Path resolution (also used by liquid-gen for MemberExpression in JSX)
// ---------------------------------------------------------------------------

/**
 * Walks a (possibly nested) MemberExpression and builds a dot-separated
 * Liquid path when the root identifier is a loop variable or tap()-mapped object.
 *
 * Examples:
 *   image              (loop var)           → 'image'
 *   image.url          (loop var + prop)    → 'image.url'
 *   image.assets.src   (deeper)             → 'image.assets.src'
 *   product            (tap mapped 'product') → 'product'
 *
 * Returns null for:
 *   - Computed accesses (arr[0], obj[key])
 *   - Root identifiers that are neither loop vars nor tap-mapped
 */
export function resolveMemberPath(
  node: AstNode,
  mappings: TapMapping,
  loopVars: Set<string>,
): string | null {
  if (isIdentifier(node)) {
    if (loopVars.has(node.name)) return node.name;
    if (mappings[node.name]) return stripLiquidBraces(mappings[node.name]);
    return null;
  }

  if (isMemberExpression(node)) {
    if (node.computed) return null; // arr[0] — bail out

    const objPath = resolveMemberPath(node.object, mappings, loopVars);
    if (!objPath) return null;

    if (!isIdentifier(node.property)) return null;
    return `${objPath}.${node.property.name}`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strips `{{ }}` braces from a Liquid expression string so it can be used
 * in tag context ({% if expr %}, {% for x in expr %}).
 *
 * '{{ product.available }}'  → 'product.available'
 * 'product.images'           → 'product.images'   (already plain)
 * '{% raw tag %}'            → returned unchanged
 */
export function stripLiquidBraces(liquidStr: string): string {
  const trimmed = liquidStr.trim();
  if (trimmed.startsWith('{{') && trimmed.endsWith('}}')) {
    return trimmed.slice(2, -2).trim();
  }
  return trimmed;
}

/**
 * Returns true if a Liquid expression string contains filter pipes.
 * Filters are only valid in output context ({{ expr | filter }}), not in
 * tag context ({% if expr %}, {% for x in expr %}).
 *
 * 'product.price | money'        → true
 * 'product.available'            → false
 * '{{ product.price | money }}'  → true  (checks after brace stripping)
 */
export function hasLiquidFilters(liquidStr: string): boolean {
  const bare = stripLiquidBraces(liquidStr);
  return bare.includes('|');
}
