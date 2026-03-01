/**
 * Lightweight helpers for navigating the oxc-parser AST.
 *
 * oxc-parser returns an ESTree-compatible AST but with some differences
 * from Babel. The helpers here are intentionally defensive so they work
 * across minor oxc version variations.
 */

export interface AstNode {
  type: string;
  /** Byte offset of the node start in the source string (oxc-parser native) */
  start?: number;
  /** Byte offset of the node end in the source string (oxc-parser native) */
  end?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Node type guards
// ---------------------------------------------------------------------------

export function isIdentifier(node: unknown): node is AstNode & { name: string } {
  if (!node || typeof node !== 'object') return false;
  const n = node as AstNode;
  // oxc uses 'Identifier' for most identifier nodes
  return n.type === 'Identifier' && typeof n.name === 'string';
}

export function isStringLiteral(node: unknown): node is AstNode & { value: string } {
  if (!node || typeof node !== 'object') return false;
  const n = node as AstNode;
  // oxc native: StringLiteral  ESTree compat: Literal with string value
  return (
    (n.type === 'StringLiteral' && typeof n.value === 'string') ||
    (n.type === 'Literal' && typeof n.value === 'string')
  );
}

export function isCallExpression(node: unknown): node is AstNode & {
  callee: AstNode;
  arguments: AstNode[];
} {
  if (!node || typeof node !== 'object') return false;
  const n = node as AstNode;
  return n.type === 'CallExpression' && Array.isArray(n.arguments);
}

export function isVariableDeclarator(node: unknown): node is AstNode & {
  id: AstNode;
  init: AstNode | null;
} {
  if (!node || typeof node !== 'object') return false;
  return (node as AstNode).type === 'VariableDeclarator';
}

export function isJSXElement(node: unknown): node is AstNode & {
  openingElement: AstNode;
  closingElement: AstNode | null;
  children: AstNode[];
} {
  if (!node || typeof node !== 'object') return false;
  return (node as AstNode).type === 'JSXElement';
}

export function isJSXFragment(node: unknown): node is AstNode & {
  children: AstNode[];
} {
  if (!node || typeof node !== 'object') return false;
  return (node as AstNode).type === 'JSXFragment';
}

export function isJSXText(node: unknown): node is AstNode & { value: string } {
  if (!node || typeof node !== 'object') return false;
  return (node as AstNode).type === 'JSXText';
}

export function isJSXExpressionContainer(node: unknown): node is AstNode & {
  expression: AstNode;
} {
  if (!node || typeof node !== 'object') return false;
  return (node as AstNode).type === 'JSXExpressionContainer';
}

export function isJSXAttribute(node: unknown): node is AstNode & {
  name: AstNode;
  value: AstNode | null;
} {
  if (!node || typeof node !== 'object') return false;
  return (node as AstNode).type === 'JSXAttribute';
}

export function isJSXIdentifier(node: unknown): node is AstNode & { name: string } {
  if (!node || typeof node !== 'object') return false;
  const n = node as AstNode;
  return n.type === 'JSXIdentifier' && typeof n.name === 'string';
}

export function isJSXMemberExpression(node: unknown): node is AstNode & {
  object: AstNode;
  property: AstNode;
} {
  if (!node || typeof node !== 'object') return false;
  return (node as AstNode).type === 'JSXMemberExpression';
}

export function isReturnStatement(node: unknown): node is AstNode & {
  argument: AstNode | null;
} {
  if (!node || typeof node !== 'object') return false;
  return (node as AstNode).type === 'ReturnStatement';
}

export function isMemberExpression(node: unknown): node is AstNode & {
  object: AstNode;
  property: AstNode;
  computed: boolean;
} {
  if (!node || typeof node !== 'object') return false;
  const n = node as AstNode;
  return n.type === 'MemberExpression' &&
    !!n.object && !!n.property &&
    typeof n.computed === 'boolean';
}

export function isUnaryExpression(node: unknown): node is AstNode & {
  operator: string;
  argument: AstNode;
} {
  if (!node || typeof node !== 'object') return false;
  const n = node as AstNode;
  return n.type === 'UnaryExpression' && typeof n.operator === 'string' && !!n.argument;
}

/** Returns true for ArrowFunctionExpression or FunctionExpression. */
export function isFunctionLike(node: unknown): node is AstNode & {
  params: AstNode[];
  body: AstNode;
} {
  if (!node || typeof node !== 'object') return false;
  const n = node as AstNode;
  return (
    (n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression') &&
    Array.isArray(n.params) &&
    !!n.body
  );
}

// ---------------------------------------------------------------------------
// TypeScript type-assertion unwrapping
// ---------------------------------------------------------------------------

/**
 * Strips TypeScript type assertion wrappers and returns the inner expression.
 * Handles:
 *   - TSAsExpression:        `expr as T`
 *   - TSSatisfiesExpression: `expr satisfies T`
 *   - TSNonNullExpression:   `expr!`
 *
 * Useful so that `tap(...) as SomeType` is still recognised as a tap() call
 * even though the VariableDeclarator's `init` is technically a TSAsExpression.
 */
export function unwrapTypeAssertions(node: AstNode): AstNode {
  let current = node;
  while (
    current.type === 'TSAsExpression' ||
    current.type === 'TSSatisfiesExpression' ||
    current.type === 'TSNonNullExpression'
  ) {
    current = current.expression as AstNode;
  }
  return current;
}

// ---------------------------------------------------------------------------
// tap() detection
// ---------------------------------------------------------------------------

/**
 * Returns true if node is `tap(stringLiteral, anything)`.
 */
export function isTapCall(node: unknown): node is AstNode & {
  callee: AstNode & { name: string };
  arguments: [AstNode & { value: string }, AstNode];
} {
  if (!isCallExpression(node)) return false;
  if (!isIdentifier(node.callee) || node.callee.name !== 'tap') return false;
  if (node.arguments.length < 2) return false;
  if (!isStringLiteral(node.arguments[0])) return false;
  return true;
}

/**
 * Returns true if node is `tapWhen(stringLiteral, depsArray, fallback)`.
 * tapWhen is the reactive variant of tap() — the compiler replaces it with
 * createTapSignal(key, deps, fallback) in the cleaned source.
 */
export function isTapWhenCall(node: unknown): node is AstNode & {
  callee: AstNode & { name: string };
  arguments: [AstNode & { value: string }, AstNode, AstNode];
} {
  if (!isCallExpression(node)) return false;
  if (!isIdentifier(node.callee) || node.callee.name !== 'tapWhen') return false;
  if (node.arguments.length < 3) return false;
  if (!isStringLiteral(node.arguments[0])) return false;
  return true;
}

/**
 * Returns true if node is `tapPersonalized(urlString, paramsObj, fallback)`.
 * The first argument is a string literal (the API endpoint URL).
 */
export function isTapPersonalizedCall(node: unknown): node is AstNode & {
  callee: AstNode & { name: string };
  arguments: [AstNode & { value: string }, AstNode, AstNode];
} {
  if (!isCallExpression(node)) return false;
  if (!isIdentifier(node.callee) || node.callee.name !== 'tapPersonalized') return false;
  if (node.arguments.length < 3) return false;
  if (!isStringLiteral(node.arguments[0])) return false;
  return true;
}

/**
 * Returns true if node is `tapRemote(ComponentIdentifier, url)`.
 * Unlike tap/tapWhen, the first argument is a component identifier (not a string).
 */
export function isTapRemoteCall(node: unknown): node is AstNode & {
  callee: AstNode & { name: string };
  arguments: [AstNode & { name: string }, AstNode];
} {
  if (!isCallExpression(node)) return false;
  if (!isIdentifier(node.callee) || node.callee.name !== 'tapRemote') return false;
  if (node.arguments.length < 2) return false;
  if (!isIdentifier(node.arguments[0])) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Generic AST walker
// ---------------------------------------------------------------------------

type Visitor = (node: AstNode, parent: AstNode | null) => void | 'stop';

/**
 * Depth-first walk of an oxc AST.
 * Calls visitor for every node that has a `type` property.
 * Return 'stop' from the visitor to halt traversal entirely.
 */
export function walkAst(
  root: unknown,
  visitor: Visitor,
  parent: AstNode | null = null,
): boolean {
  if (!root || typeof root !== 'object') return false;

  const node = root as AstNode;
  if (typeof node.type !== 'string') return false;

  const result = visitor(node, parent);
  if (result === 'stop') return true; // propagate stop

  for (const key of Object.keys(node)) {
    if (key === 'span' || key === 'type') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && typeof (item as AstNode).type === 'string') {
          const stopped = walkAst(item, visitor, node);
          if (stopped) return true;
        }
      }
    } else if (child && typeof child === 'object' && typeof (child as AstNode).type === 'string') {
      const stopped = walkAst(child, visitor, node);
      if (stopped) return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// JSX tag name resolution
// ---------------------------------------------------------------------------

/**
 * Resolves a JSXOpeningElement's name to a string.
 * Returns null if it can't be resolved (e.g. complex member expression).
 */
export function getJSXTagName(nameNode: AstNode): string | null {
  if (isJSXIdentifier(nameNode)) return nameNode.name;
  if (isJSXMemberExpression(nameNode)) {
    const obj = getJSXTagName(nameNode.object);
    const prop = getJSXTagName(nameNode.property);
    if (obj && prop) return `${obj}.${prop}`;
  }
  return null;
}

/**
 * Returns true if the tag name represents a SolidJS component
 * (starts with uppercase or contains a dot).
 */
export function isComponentTag(tagName: string): boolean {
  return tagName.charAt(0) === tagName.charAt(0).toUpperCase() &&
    tagName.charAt(0) !== tagName.charAt(0).toLowerCase();
}

// ---------------------------------------------------------------------------
// String utilities
// ---------------------------------------------------------------------------

/**
 * Converts PascalCase or camelCase to kebab-case.
 * e.g. ProductCard → product-card, CartDrawer → cart-drawer
 */
export function toKebabCase(name: string): string {
  return name
    .replace(/([A-Z])/g, (_, char: string, offset: number) =>
      offset > 0 ? `-${char.toLowerCase()}` : char.toLowerCase(),
    )
    .replace(/[_\s]+/g, '-');
}
