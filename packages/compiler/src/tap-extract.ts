/**
 * tap-extract.ts
 *
 * Extracts tap() mappings from a component's source and produces a
 * cleaned version of the source suitable for the client-side JS bundle
 * (where tap() calls are replaced by their fallback values).
 *
 * Uses oxc-parser for fast AST parsing and magic-string for
 * source-map-preserving replacements.
 */

import { parseSync } from 'oxc-parser';
import MagicString from 'magic-string';
import {
  isTapCall,
  isTapWhenCall,
  isTapPersonalizedCall,
  isTapRemoteCall,
  isIdentifier,
  isVariableDeclarator,
  isJSXExpressionContainer,
  unwrapTypeAssertions,
  walkAst,
  toKebabCase,
  type AstNode,
} from './ast-utils.js';

/** Returns true if node has valid start/end offsets for magic-string surgery */
function hasSpan(node: AstNode): node is AstNode & { start: number; end: number } {
  return typeof node.start === 'number' && typeof node.end === 'number';
}

export interface TapMapping {
  /** Variable name (or __tap_inline_N__ for inline calls) → Liquid expression */
  [variableName: string]: string;
}

export interface PersonalizedCallInfo {
  /** LHS variable name */
  varName: string;
  /** API endpoint URL (first arg) */
  url: string;
  /** paramKey → tap variable name used as the param value */
  params: Record<string, string>;
}

export interface TapExtractResult {
  /** Map of variable name → liquid expression string */
  mappings: TapMapping;
  /** Source with tap() calls replaced by fallbacks, for the JS bundle */
  cleanedSource: string;
  /** Source map for the cleaned source */
  sourceMap: string;
  /** Any warnings generated during extraction */
  warnings: string[];
  /**
   * Variable names bound via tapWhen() — these need a data section so the
   * runtime can re-fetch their values when the dep signals change.
   */
  reactiveVars: Set<string>;
  /**
   * PascalCase component names referenced via tapRemote() — the plugin
   * generates a wrapper section for each so Shopify can render the snippet.
   */
  remoteComponents: Set<string>;
  /**
   * tapPersonalized() calls found in this component — each describes an
   * external API endpoint, its param-to-tap-variable mapping, and the LHS
   * variable name.
   */
  personalizedCalls: PersonalizedCallInfo[];
}

export function extractTapMappings(
  source: string,
  filename = 'component.tsx',
): TapExtractResult {
  const { program, errors } = parseSync(filename, source);

  const warnings: string[] = [];

  if (errors.length > 0) {
    for (const err of errors) {
      warnings.push(`Parse error in ${filename}: ${err.message}`);
    }
  }

  const mappings: TapMapping = {};
  const reactiveVars = new Set<string>();
  const remoteComponents = new Set<string>();
  const personalizedCalls: PersonalizedCallInfo[] = [];
  const s = new MagicString(source);
  let inlineCounter = 0;
  let needsTapRemoteImport = false;
  let needsPersonalizedImport = false;

  walkAst(program, (node: AstNode) => {
    // -----------------------------------------------------------------------
    // Case 1: const varName = tap('{{ liquid.expr }}', fallback)
    //         const varName = tap('{{ liquid.expr }}', fallback) as T
    //         const varName = tapWhen('{{ liquid.expr }}', deps, fallback)
    //         (and satisfies T / ! variants of the above)
    // -----------------------------------------------------------------------
    if (isVariableDeclarator(node)) {
      const { id, init } = node;
      if (!init || !isIdentifier(id)) return;

      // Unwrap TypeScript type assertions so `tap(...) as T` still matches.
      const inner = unwrapTypeAssertions(init);
      const isTap     = isTapCall(inner);
      const isTapWhen = !isTap && isTapWhenCall(inner);
      const isTapPersonalized = !isTap && !isTapWhen && isTapPersonalizedCall(inner);
      const isTapRemote = !isTap && !isTapWhen && !isTapPersonalized && isTapRemoteCall(inner);
      if (!isTap && !isTapWhen && !isTapPersonalized && !isTapRemote) return;

      if (isTapPersonalized) {
        // tapPersonalized(url, { params }, fallback) → createPersonalizedSignal(url, { params }, fallback)
        const varName = id.name;
        const urlLiteral = (inner.arguments[0] as AstNode & { value: string }).value;
        const paramsNode = inner.arguments[1] as AstNode;
        const fallbackNode = inner.arguments[2] as AstNode;

        // Parse the ObjectExpression to extract param keys and their tap variable names
        const params: Record<string, string> = {};
        if (paramsNode.type === 'ObjectExpression' && Array.isArray(paramsNode.properties)) {
          for (const prop of paramsNode.properties as AstNode[]) {
            if (prop.type !== 'Property') continue;
            const keyNode = prop.key as AstNode;
            const valueNode = prop.value as AstNode;
            const keyName = isIdentifier(keyNode)
              ? keyNode.name
              : (keyNode as AstNode & { value: string }).value;
            // Shorthand { customerId } → key and value are the same identifier
            const valueName = isIdentifier(valueNode) ? valueNode.name : keyName;
            params[keyName] = valueName;
          }
        }

        personalizedCalls.push({ varName, url: urlLiteral, params });
        needsPersonalizedImport = true;

        // Replace with createPersonalizedSignal(url, paramsSource, fallback)
        // Preserve the params source text verbatim so JS bundle gets actual variable references
        if (hasSpan(paramsNode) && hasSpan(fallbackNode) && hasSpan(init)) {
          const paramsSrc = source.slice(paramsNode.start, paramsNode.end);
          const fallbackSrc = source.slice(fallbackNode.start, fallbackNode.end);
          s.overwrite(
            init.start, init.end,
            `createPersonalizedSignal(${JSON.stringify(urlLiteral)}, ${paramsSrc}, ${fallbackSrc})`,
          );
        }
        return;
      }

      if (isTapRemote) {
        // tapRemote(Component, url) → __tapRemoteHtml("remote-kebab-name", url)
        const compName = (inner.arguments[0] as AstNode & { name: string }).name;
        const urlNode = inner.arguments[1] as AstNode;
        remoteComponents.add(compName);
        needsTapRemoteImport = true;
        if (hasSpan(urlNode) && hasSpan(init)) {
          const kebabName = toKebabCase(compName);
          const urlSrc = source.slice(urlNode.start, urlNode.end);
          s.overwrite(
            init.start, init.end,
            `__tapRemoteHtml("remote-${kebabName}", ${urlSrc})`,
          );
        }
        return;
      }

      const varName   = id.name;
      const liquidExpr = (inner.arguments[0] as AstNode & { value: string }).value;

      validateLiquidExpr(liquidExpr, varName, warnings);
      mappings[varName] = liquidExpr;

      if (isTap) {
        // Replace the FULL init (including any outer `as T`) with the fallback.
        const fallbackNode = inner.arguments[1] as AstNode;
        if (hasSpan(fallbackNode) && hasSpan(init)) {
          const fallbackSrc = source.slice(fallbackNode.start, fallbackNode.end);
          s.overwrite(init.start, init.end, fallbackSrc);
        }
      } else {
        // tapWhen — replace with createTapSignal(key, deps, fallback).
        // The key is injected by the compiler; the runtime uses it to read the
        // right field from the JSON data section response.
        reactiveVars.add(varName);
        const depsNode     = inner.arguments[1] as AstNode;
        const fallbackNode = inner.arguments[2] as AstNode;
        if (hasSpan(depsNode) && hasSpan(fallbackNode) && hasSpan(init)) {
          const depsSrc     = source.slice(depsNode.start, depsNode.end);
          const fallbackSrc = source.slice(fallbackNode.start, fallbackNode.end);
          s.overwrite(
            init.start, init.end,
            `createTapSignal(${JSON.stringify(varName)}, ${depsSrc}, ${fallbackSrc})`,
          );
        }
      }
      return;
    }

    // -----------------------------------------------------------------------
    // Case 2: {tap('{{ liquid.expr }}', fallback)} inline in JSX
    //         {tap('{{ liquid.expr }}', fallback) as T}
    // e.g. <h1>{tap('{{ product.title }}', 'Default')}</h1>
    // -----------------------------------------------------------------------
    if (isJSXExpressionContainer(node)) {
      const expr  = node.expression;
      const inner = unwrapTypeAssertions(expr);

      // tapRemote() inline in JSX: {tapRemote(Component, url)}
      if (isTapRemoteCall(inner)) {
        const compName = (inner.arguments[0] as AstNode & { name: string }).name;
        const urlNode = inner.arguments[1] as AstNode;
        remoteComponents.add(compName);
        needsTapRemoteImport = true;
        if (hasSpan(urlNode) && hasSpan(expr)) {
          const kebabName = toKebabCase(compName);
          const urlSrc = source.slice(urlNode.start, urlNode.end);
          s.overwrite(
            expr.start, expr.end,
            `__tapRemoteHtml("remote-${kebabName}", ${urlSrc})`,
          );
        }
        return;
      }

      if (!isTapCall(inner)) return;

      const liquidExpr   = (inner.arguments[0] as AstNode & { value: string }).value;
      const fallbackNode = inner.arguments[1] as AstNode;

      // Create a synthetic variable name so liquid-gen can reference it
      const syntheticName = `__tap_inline_${inlineCounter++}__`;

      validateLiquidExpr(liquidExpr, 'inline', warnings);
      mappings[syntheticName] = liquidExpr;

      // Overwrite the FULL expr (including any outer `as T`) with just the fallback
      if (hasSpan(fallbackNode) && hasSpan(expr)) {
        const fallbackSrc = source.slice(fallbackNode.start, fallbackNode.end);
        s.overwrite(expr.start, expr.end, fallbackSrc);
      }
    }
  });

  // If any tapWhen() calls were found, prepend the createTapSignal import.
  // The compiler-emitted createTapSignal() calls need this symbol available.
  if (reactiveVars.size > 0) {
    s.prepend(`import { createTapSignal } from '$lib/runtime';\n`);
  }

  // If any tapPersonalized() calls were found, prepend the createPersonalizedSignal import.
  if (needsPersonalizedImport) {
    s.prepend(`import { createPersonalizedSignal } from '$lib/runtime';\n`);
  }

  // If any tapRemote() calls were found, prepend the __tapRemoteHtml import.
  if (needsTapRemoteImport) {
    s.prepend(`import { __tapRemoteHtml } from '$lib/runtime';\n`);
  }

  const cleanedSource = s.toString();
  const sourceMap = s.generateMap({ hires: true }).toString();

  return { mappings, cleanedSource, sourceMap, warnings, reactiveVars, remoteComponents, personalizedCalls };
}

function validateLiquidExpr(expr: string, context: string, warnings: string[]): void {
  // Reject template literals — only string literals are valid
  // (This check is done at AST level via isStringLiteral, but add a runtime guard)
  if (expr.includes('`')) {
    warnings.push(
      `tap() in "${context}": liquid expression contains a backtick. ` +
      `Use a plain string literal, not a template literal.`,
    );
  }
}
