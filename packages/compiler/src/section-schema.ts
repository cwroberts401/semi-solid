/**
 * section-schema.ts
 *
 * Extracts the `export const schema = { ... }` declaration from a SolidJS
 * component source file and serialises it to a Shopify {% schema %} tag.
 *
 * A component that exports `schema` is treated as a Shopify *section*
 * (written to sections/*.liquid with a {% schema %}…{% endschema %} footer)
 * rather than a snippet.
 */

import { parseSync } from 'oxc-parser';
import { walkAst, unwrapTypeAssertions, type AstNode } from './ast-utils.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parses `source` and returns the evaluated value of the top-level
 * `export const schema = { … }` declaration, or `null` if none is found.
 *
 * Supports `as const` / `satisfies T` type assertion wrappers.
 * The returned object is a plain JSON-compatible value (no functions, no symbols).
 *
 * @throws {Error} if the schema value contains unsupported AST node types.
 */
export function extractSectionSchema(source: string): object | null {
  const { program, errors } = parseSync('__schema__.tsx', source);

  if (errors.length > 0) {
    // Propagate parse errors so callers can warn appropriately
    const msgs = errors.map((e) => (e as { message: string }).message).join(', ');
    throw new Error(`Parse errors while extracting schema: ${msgs}`);
  }

  let schemaValue: AstNode | null = null;

  walkAst(program, (node) => {
    if (schemaValue) return; // already found

    // Look for: export const schema = <expr>
    if (node.type !== 'ExportNamedDeclaration') return;

    const decl = node.declaration as AstNode | null;
    if (!decl || decl.type !== 'VariableDeclaration') return;

    const declarations = decl.declarations as AstNode[];
    for (const declarator of declarations) {
      if (declarator.type !== 'VariableDeclarator') continue;
      const id = declarator.id as AstNode;
      if (id.type !== 'Identifier' || (id as AstNode & { name: string }).name !== 'schema') continue;

      const init = declarator.init as AstNode | null;
      if (!init) continue;

      // Unwrap `as const`, `satisfies T`, `!` wrappers
      const unwrapped = unwrapTypeAssertions(init);

      if (unwrapped.type !== 'ObjectExpression') continue;

      schemaValue = unwrapped;
      break;
    }
  });

  if (!schemaValue) return null;

  return evaluateAstValue(schemaValue) as object;
}

/**
 * Wraps a schema object in a Shopify {% schema %}…{% endschema %} tag.
 */
export function formatSchemaTag(schemaObj: object): string {
  return `{% schema %}\n${JSON.stringify(schemaObj, null, 2)}\n{% endschema %}\n`;
}

// ---------------------------------------------------------------------------
// AST value evaluator
// ---------------------------------------------------------------------------

/**
 * Recursively evaluates an AST node to a plain JSON-compatible value.
 *
 * Supported node types:
 *   Literal / StringLiteral / NumericLiteral / BooleanLiteral → primitive .value
 *   ObjectExpression                                          → plain object
 *   ArrayExpression                                           → array
 *   UnaryExpression (-)                                       → negated number
 *   TemplateLiteral (no expressions)                          → concatenated string
 *
 * @throws {Error} for any unsupported node type.
 */
export function evaluateAstValue(node: AstNode): unknown {
  switch (node.type) {
    // Literals (oxc native + ESTree compat)
    case 'Literal':
    case 'StringLiteral':
    case 'NumericLiteral':
    case 'BooleanLiteral': {
      return (node as AstNode & { value: unknown }).value;
    }

    case 'NullLiteral': {
      return null;
    }

    case 'ObjectExpression': {
      const result: Record<string, unknown> = {};
      for (const prop of node.properties as AstNode[]) {
        if (prop.type !== 'Property' && prop.type !== 'ObjectProperty') {
          throw new Error(
            `Unsupported property type in schema object: ${prop.type}. ` +
              `Only plain properties are allowed.`,
          );
        }
        const key = resolvePropertyKey(prop.key as AstNode);
        result[key] = evaluateAstValue(prop.value as AstNode);
      }
      return result;
    }

    case 'ArrayExpression': {
      const elements = node.elements as Array<AstNode | null>;
      return elements.map((el) => {
        if (!el) return null; // sparse array hole
        return evaluateAstValue(el);
      });
    }

    case 'UnaryExpression': {
      if ((node as AstNode & { operator: string }).operator === '-') {
        const inner = evaluateAstValue(node.argument as AstNode);
        if (typeof inner !== 'number') {
          throw new Error(
            `UnaryExpression '-' applied to non-numeric value in schema.`,
          );
        }
        return -inner;
      }
      throw new Error(
        `Unsupported UnaryExpression operator '${(node as AstNode & { operator: string }).operator}' in schema. ` +
          `Only '-' (negation) is supported.`,
      );
    }

    case 'TemplateLiteral': {
      const quasis = node.quasis as AstNode[];
      const exprs = node.expressions as AstNode[];
      if (exprs.length > 0) {
        throw new Error(
          `TemplateLiteral with expressions is not supported in schema values. ` +
            `Use plain string literals instead.`,
        );
      }
      // Simple template: `foo bar` — concatenate cooked quasis
      return quasis
        .map((q) => ((q.value as { cooked?: string; raw?: string })?.cooked ?? ''))
        .join('');
    }

    // TSAsExpression / TSSatisfiesExpression / TSNonNullExpression can appear
    // when the initialiser is `{ ... } as const satisfies SomeType`. Strip them.
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression': {
      return evaluateAstValue(unwrapTypeAssertions(node));
    }

    default: {
      throw new Error(
        `Unsupported AST node type '${node.type}' in schema value. ` +
          `Schema must contain only literals, objects, and arrays.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolves the key of an ObjectExpression Property to a string.
 * Handles Identifier keys (foo:), string literals ("foo":), and numeric literals.
 */
function resolvePropertyKey(keyNode: AstNode): string {
  if (keyNode.type === 'Identifier') {
    return (keyNode as AstNode & { name: string }).name;
  }
  if (
    keyNode.type === 'Literal' ||
    keyNode.type === 'StringLiteral' ||
    keyNode.type === 'NumericLiteral'
  ) {
    return String((keyNode as AstNode & { value: unknown }).value);
  }
  throw new Error(
    `Unsupported property key type '${keyNode.type}' in schema object.`,
  );
}
