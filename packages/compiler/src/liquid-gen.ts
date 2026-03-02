/**
 * liquid-gen.ts
 *
 * Generates a .liquid snippet from a SolidJS component's source code
 * by walking the JSX AST and emitting Liquid equivalents.
 *
 * Phase 1: plain HTML, tap()-mapped variables in text/attributes, t() calls.
 * Phase 2: <Show> → {% if %} / {% unless %}, <For> → {% for %}.
 * Phase 3 (TODO): component imports → {% render 'snippet' %}.
 */

import { parseSync } from 'oxc-parser';
import {
  isIdentifier,
  isStringLiteral,
  isCallExpression,
  isJSXElement,
  isJSXFragment,
  isJSXText,
  isJSXExpressionContainer,
  isJSXAttribute,
  isJSXIdentifier,
  isTapCall,
  isComponentTag,
  isReturnStatement,
  isFunctionLike,
  isMemberExpression,
  walkAst,
  getJSXTagName,
  toKebabCase,
  type AstNode,
} from './ast-utils.js';
import type { TapMapping } from './tap-extract.js';
import {
  resolveShowCondition,
  resolveForIteration,
  resolveMemberPath,
  stripLiquidBraces,
  hasLiquidFilters,
} from './control-flow.js';

// ---------------------------------------------------------------------------
// Client-only framework components that have no Liquid equivalent.
//
// Transparent: render children through to the Liquid output (animation
// wrappers, context providers, etc.).
// Opaque: skip entirely — their content is purely client-side (portals,
// suspense boundaries, error boundaries).
// ---------------------------------------------------------------------------
const TRANSPARENT_COMPONENTS = new Set([
  'Transition',
  'TransitionGroup',
  'ErrorBoundary',
  'Suspense',
]);

const OPAQUE_COMPONENTS = new Set([
  'Portal',
  'Dynamic',
]);

export interface LiquidGenOptions {
  /** Component name, e.g. 'ProductCard'. Used in error messages. */
  componentName: string;
  /** Indent string for pretty-printing. Default: two spaces. */
  indent?: string;
  /**
   * Pre-computed data-props attribute value for client-side hydration.
   * When set, the root HTML element receives data-component and data-props
   * attributes so SolidJS's render() can target the SSR-rendered element.
   * Generate this value with generateDataProps() from hydration.ts.
   */
  dataProps?: string;
  /**
   * Section ID for the companion JSON data section, e.g. 'product-card-data'.
   * When set, the root HTML element also receives a data-section-id attribute
   * so the hydration entry can pass it to createTapSignal() for tapWhen() calls.
   */
  dataSectionId?: string;
  /**
   * PascalCase names of components that are Shopify sections.
   * When set, <ComponentName /> emits {% section 'component-name' %} instead
   * of {% render 'component-name' %}.
   */
  sectionComponents?: Set<string>;
  /**
   * Mutable array that accumulates build-time warnings during Liquid generation.
   * Callers can inspect this after generateLiquid() returns to surface warnings
   * via the build tool (e.g. Vite/Rollup this.warn()).
   */
  warnings?: string[];
}

export function generateLiquid(
  source: string,
  mappings: TapMapping,
  options: LiquidGenOptions,
): string {
  const filename = `${options.componentName}.tsx`;
  const { program, errors } = parseSync(filename, source);

  if (errors.length > 0) {
    const msgs = errors.map((e) => e.message).join(', ');
    throw new Error(`Parse errors in ${filename}: ${msgs}`);
  }

  // Find the first JSX return statement in the component
  let jsxRoot: AstNode | null = null;

  walkAst(program, (node) => {
    if (jsxRoot) return;
    if (isReturnStatement(node) && node.argument) {
      let candidate = node.argument as AstNode;
      // oxc wraps `return (<div>)` in a ParenthesizedExpression node
      if (candidate.type === 'ParenthesizedExpression' && candidate.expression) {
        candidate = candidate.expression as AstNode;
      }
      if (isJSXElement(candidate) || isJSXFragment(candidate)) {
        jsxRoot = candidate;
      }
    }
  });

  if (!jsxRoot) {
    throw new Error(
      `No JSX return statement found in ${filename}. ` +
      `The component must return JSX directly from its function body.`,
    );
  }

  const warnings = options.warnings ?? [];

  const ctx: RenderContext = {
    mappings,
    indent: options.indent ?? '  ',
    source,
    loopVars: new Set(),
    sectionComponents: options.sectionComponents ?? new Set(),
    hydration:
      options.dataProps != null
        ? {
            componentName: options.componentName,
            dataProps: options.dataProps,
            dataSectionId: options.dataSectionId,
            applied: false,
          }
        : null,
    warnings,
  };

  return renderNode(jsxRoot, ctx, 0).trim() + '\n';
}

// ---------------------------------------------------------------------------
// Internal rendering
// ---------------------------------------------------------------------------

interface HydrationState {
  componentName: string;
  dataProps: string;
  dataSectionId: string | undefined;
  /** Mutable — set to true once the root element has been annotated. */
  applied: boolean;
}

interface RenderContext {
  mappings: TapMapping;
  indent: string;
  source: string;
  /** Variable names introduced by <For> loops at the current scope. */
  loopVars: Set<string>;
  /** PascalCase names of section components → emit {% section %} not {% render %}. */
  sectionComponents: Set<string>;
  /**
   * When present, the first plain HTML element encountered gets
   * data-component and data-props attributes for island hydration.
   * The object is shared by reference so `applied` is truly one-shot.
   */
  hydration: HydrationState | null;
  /** Mutable array for accumulating build-time warnings. */
  warnings: string[];
}

function ind(ctx: RenderContext, depth: number): string {
  return ctx.indent.repeat(depth);
}

/** Returns a new context with an additional loop variable. */
function withLoopVar(ctx: RenderContext, varName: string): RenderContext {
  return { ...ctx, loopVars: new Set([...ctx.loopVars, varName]) };
}


function renderNode(node: AstNode, ctx: RenderContext, depth: number): string {
  if (isJSXElement(node)) return renderElement(node, ctx, depth);
  if (isJSXFragment(node)) return renderChildren(node.children as AstNode[], ctx, depth);
  if (isJSXText(node)) return renderJSXText(node.value as string);
  if (isJSXExpressionContainer(node)) {
    return renderExpression(node.expression as AstNode, ctx, depth);
  }
  return '';
}

// ---------------------------------------------------------------------------
// Element rendering
// ---------------------------------------------------------------------------

function renderElement(element: AstNode, ctx: RenderContext, depth: number): string {
  const opening = element.openingElement as AstNode;
  const tagName = getJSXTagName(opening.name as AstNode);

  if (!tagName) return `<!-- unknown tag -->`;

  // -------------------------------------------------------------------------
  // Phase 2: SolidJS control-flow components
  // -------------------------------------------------------------------------
  if (tagName === 'Show') return renderShow(element, ctx, depth);
  if (tagName === 'For') return renderFor(element, ctx, depth);

  // -------------------------------------------------------------------------
  // Section block primitives: Match / Case
  // -------------------------------------------------------------------------
  if (tagName === 'Match') return renderMatch(element, ctx, depth);
  if (tagName === 'Case') return `<!-- <Case> must appear inside <Match> -->`;

  // -------------------------------------------------------------------------
  // Client-only framework components — no Liquid equivalent.
  // Transparent wrappers render their children through; opaque ones are skipped.
  // -------------------------------------------------------------------------
  if (TRANSPARENT_COMPONENTS.has(tagName)) {
    return renderChildren(element.children as AstNode[], ctx, depth);
  }
  if (OPAQUE_COMPONENTS.has(tagName)) {
    return '';
  }

  // -------------------------------------------------------------------------
  // Phase 3: custom component imports → {% render 'snippet' %}
  // -------------------------------------------------------------------------
  if (isComponentTag(tagName)) {
    return renderComponent(element, ctx, depth);
  }

  // -------------------------------------------------------------------------
  // Plain HTML element
  // -------------------------------------------------------------------------
  const attrs = renderAttributes(opening.attributes as AstNode[], ctx);

  // Phase 6: Annotate the first plain HTML element with hydration attributes.
  // The hydration object is shared by reference so this fires exactly once.
  let hydrationAttrStr = '';
  if (ctx.hydration && !ctx.hydration.applied) {
    ctx.hydration.applied = true;
    hydrationAttrStr =
      ` data-component="${ctx.hydration.componentName}" data-props='${ctx.hydration.dataProps}'`;
    if (ctx.hydration.dataSectionId) {
      hydrationAttrStr += ` data-section-id="${ctx.hydration.dataSectionId}"`;
    }
  }

  const attrStr = (attrs.length > 0 ? ' ' + attrs.join(' ') : '') + hydrationAttrStr;
  const selfClosing = !!(opening as AstNode & { selfClosing?: boolean }).selfClosing;

  if (selfClosing) {
    return `${ind(ctx, depth)}<${tagName}${attrStr} />`;
  }

  const children = element.children as AstNode[];

  if (children.length === 0) {
    return `${ind(ctx, depth)}<${tagName}${attrStr}></${tagName}>`;
  }

  const renderedChildren = children
    .map((child) => renderNode(child, ctx, depth + 1))
    .filter((s) => s.trim().length > 0);

  // Single inline child → keep on one line
  if (renderedChildren.length === 1 && !renderedChildren[0].includes('\n')) {
    const child = renderedChildren[0].trim();
    return `${ind(ctx, depth)}<${tagName}${attrStr}>${child}</${tagName}>`;
  }

  const childLines = renderedChildren
    .map((s) =>
      s.startsWith(ind(ctx, depth + 1)) ? s : `${ind(ctx, depth + 1)}${s.trim()}`,
    )
    .join('\n');

  return [
    `${ind(ctx, depth)}<${tagName}${attrStr}>`,
    childLines,
    `${ind(ctx, depth)}</${tagName}>`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// <Show when={cond} fallback={<jsx>}> → {% if %} / {% unless %}
// ---------------------------------------------------------------------------

function renderShow(element: AstNode, ctx: RenderContext, depth: number): string {
  const attrs = (element.openingElement as AstNode).attributes as AstNode[];

  const whenAttr = findJSXAttr(attrs, 'when');
  const fallbackAttr = findJSXAttr(attrs, 'fallback');

  if (!whenAttr) {
    return `<!-- <Show> missing 'when' prop -->`;
  }

  const whenExpr = getJSXAttrExpr(whenAttr);
  if (!whenExpr) {
    return `<!-- <Show> 'when' prop must be a JSX expression -->`;
  }

  const condition = resolveShowCondition(whenExpr, ctx.mappings, ctx.loopVars, ctx.warnings);

  if (!condition) {
    // Not tap-mapped — stays client-side; the JS bundle handles it
    return `<!-- <Show> condition is not Liquid-mapped — rendered client-side -->`;
  }

  const tag = condition.negated ? 'unless' : 'if';
  const endTag = condition.negated ? 'endunless' : 'endif';

  const thenContent = renderShowChildren(element.children as AstNode[], ctx, depth + 1);

  if (!fallbackAttr) {
    return [
      `${ind(ctx, depth)}{% ${tag} ${condition.liquidExpr} %}`,
      thenContent,
      `${ind(ctx, depth)}{% ${endTag} %}`,
    ].join('\n');
  }

  const fallbackContent = renderShowFallback(fallbackAttr, ctx, depth + 1);
  return [
    `${ind(ctx, depth)}{% ${tag} ${condition.liquidExpr} %}`,
    thenContent,
    `${ind(ctx, depth)}{% else %}`,
    fallbackContent,
    `${ind(ctx, depth)}{% ${endTag} %}`,
  ].join('\n');
}

/**
 * Renders the children of a <Show> block.
 * Handles both direct JSX children and accessor-function children:
 *   <Show when={x}><div>...</div></Show>           — direct
 *   <Show when={x}>{() => <div>...</div>}</Show>   — function form
 */
function renderShowChildren(children: AstNode[], ctx: RenderContext, depth: number): string {
  const parts: string[] = [];
  for (const child of children) {
    // Accessor function form: {() => <jsx>} or {(value) => <jsx>}
    if (isJSXExpressionContainer(child)) {
      const expr = child.expression as AstNode;
      if (isFunctionLike(expr)) {
        const body = extractFunctionBody(expr);
        if (body) {
          parts.push(renderNode(body, ctx, depth));
          continue;
        }
      }
    }
    const rendered = renderNode(child, ctx, depth);
    if (rendered.trim()) parts.push(rendered);
  }
  return parts
    .map((s) => (s.startsWith(ind(ctx, depth)) ? s : `${ind(ctx, depth)}${s.trim()}`))
    .join('\n');
}

/**
 * Renders the `fallback` prop value of a <Show>.
 * The prop value is always a JSXExpressionContainer wrapping the JSX.
 */
function renderShowFallback(fallbackAttr: AstNode, ctx: RenderContext, depth: number): string {
  const value = fallbackAttr.value as AstNode | null;
  if (!value) return '';
  // fallback={<jsx>} — value is a JSXExpressionContainer
  if (isJSXExpressionContainer(value)) {
    const expr = value.expression as AstNode;
    if (isJSXElement(expr) || isJSXFragment(expr)) {
      const rendered = renderNode(expr, ctx, depth);
      return rendered.startsWith(ind(ctx, depth))
        ? rendered
        : `${ind(ctx, depth)}${rendered.trim()}`;
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// <For each={collection}>{(item) => <jsx>}</For> → {% for item in collection %}
// ---------------------------------------------------------------------------

function renderFor(element: AstNode, ctx: RenderContext, depth: number): string {
  const attrs = (element.openingElement as AstNode).attributes as AstNode[];
  const eachAttr = findJSXAttr(attrs, 'each');

  if (!eachAttr) {
    return `<!-- <For> missing 'each' prop -->`;
  }

  const eachExpr = getJSXAttrExpr(eachAttr);
  if (!eachExpr) {
    return `<!-- <For> 'each' prop must be a JSX expression -->`;
  }

  // Find the render function in children
  const children = element.children as AstNode[];
  const funcContainer = children.find(
    (c) => isJSXExpressionContainer(c) && isFunctionLike((c as AstNode).expression as AstNode),
  );

  if (!funcContainer) {
    return `<!-- <For> children must be a render function: {(item) => <jsx>} -->`;
  }

  const renderFn = (funcContainer as AstNode).expression as AstNode;
  const params = renderFn.params as AstNode[];

  if (params.length === 0 || !isIdentifier(params[0])) {
    return `<!-- <For> render function must have at least one identifier parameter -->`;
  }

  const loopVarName = (params[0] as AstNode & { name: string }).name;

  const iteration = resolveForIteration(eachExpr, loopVarName, ctx.mappings, ctx.loopVars, ctx.warnings);

  if (!iteration) {
    return `<!-- <For> collection is not Liquid-mapped — rendered client-side -->`;
  }

  // Extract the JSX body from the render function
  const bodyJSX = extractFunctionBody(renderFn);
  if (!bodyJSX) {
    return `<!-- <For> could not extract JSX body from render function -->`;
  }

  // Render body with the loop variable in scope
  const loopCtx = withLoopVar(ctx, iteration.loopVar);
  const bodyContent = renderNode(bodyJSX, loopCtx, depth + 1);
  const indentedBody = bodyContent.startsWith(ind(ctx, depth + 1))
    ? bodyContent
    : `${ind(ctx, depth + 1)}${bodyContent.trim()}`;

  return [
    `${ind(ctx, depth)}{% for ${iteration.loopVar} in ${iteration.collection} %}`,
    indentedBody,
    `${ind(ctx, depth)}{% endfor %}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// <Match on={expr}> / <Case value="val"> → {% case %}{% when %}{% endcase %}
// ---------------------------------------------------------------------------

/**
 * Renders a <Match on={expr}> element as a Liquid {% case %}{% when %}{% endcase %} block.
 *
 * <Match on={block.type}>
 *   <Case value="item"><div>...</div></Case>
 *   <Case value="promo"><p>...</p></Case>
 * </Match>
 *
 * →
 *
 * {% case block.type %}
 *   {% when 'item' %}
 *     <div>...</div>
 *   {% when 'promo' %}
 *     <p>...</p>
 * {% endcase %}
 */
function renderMatch(element: AstNode, ctx: RenderContext, depth: number): string {
  const attrs = (element.openingElement as AstNode).attributes as AstNode[];
  const onAttr = findJSXAttr(attrs, 'on');

  if (!onAttr) {
    return `<!-- <Match> missing 'on' prop -->`;
  }

  const onExpr = getJSXAttrExpr(onAttr);
  if (!onExpr) {
    return `<!-- <Match> 'on' prop must be a JSX expression -->`;
  }

  // Resolve to a Liquid path
  let liquidPath: string | null = null;

  // Try member expression path first (e.g. block.type)
  const memberPath = resolveMemberPath(onExpr, ctx.mappings, ctx.loopVars);
  if (memberPath) {
    liquidPath = memberPath;
  } else if (isIdentifier(onExpr)) {
    // Tap-mapped identifier
    const varName = (onExpr as AstNode & { name: string }).name;
    if (ctx.mappings[varName]) {
      liquidPath = stripLiquidBraces(ctx.mappings[varName]);
    } else if (ctx.loopVars.has(varName)) {
      liquidPath = varName;
    }
  }

  if (liquidPath && liquidPath.includes('|')) {
    ctx.warnings.push(
      `<Match on={...}>: resolved expression '${liquidPath}' contains Liquid filters ` +
      `which are not valid in {% case %} tag context. Falling back to client-side rendering.`,
    );
    liquidPath = null;
  }

  if (!liquidPath) {
    return `<!-- <Match> expression is not Liquid-mapped — rendered client-side -->`;
  }

  // Collect <Case> children
  const children = element.children as AstNode[];
  const caseParts: string[] = [];

  for (const child of children) {
    if (!isJSXElement(child)) continue;
    const caseTag = getJSXTagName((child.openingElement as AstNode).name as AstNode);
    if (caseTag !== 'Case') continue;

    const caseAttrs = (child.openingElement as AstNode).attributes as AstNode[];
    const valueAttr = findJSXAttr(caseAttrs, 'value');

    if (!valueAttr) {
      caseParts.push(`${ind(ctx, depth + 1)}<!-- <Case> missing 'value' prop -->`);
      continue;
    }

    // value can be a string literal attr: value="item"
    // or a JSXExpressionContainer wrapping a string literal: value={"item"}
    let caseValue: string | null = null;
    const rawValue = valueAttr.value as AstNode | null;
    if (rawValue) {
      if (isStringLiteral(rawValue)) {
        caseValue = (rawValue as AstNode & { value: string }).value;
      } else if (isJSXExpressionContainer(rawValue)) {
        const inner = rawValue.expression as AstNode;
        if (isStringLiteral(inner)) {
          caseValue = (inner as AstNode & { value: string }).value;
        }
      }
    }

    if (caseValue === null) {
      caseParts.push(`${ind(ctx, depth + 1)}<!-- <Case> 'value' must be a string literal -->`);
      continue;
    }

    const caseChildren = child.children as AstNode[];
    const renderedBody = caseChildren
      .map((c) => renderNode(c, ctx, depth + 2))
      .filter((s) => s.trim().length > 0);

    const bodyLines = renderedBody
      .map((s) =>
        s.startsWith(ind(ctx, depth + 2)) ? s : `${ind(ctx, depth + 2)}${s.trim()}`,
      )
      .join('\n');

    caseParts.push(
      `${ind(ctx, depth + 1)}{% when '${caseValue}' %}` +
        (bodyLines ? `\n${bodyLines}` : ''),
    );
  }

  if (caseParts.length === 0) {
    return `${ind(ctx, depth)}{% case ${liquidPath} %}\n${ind(ctx, depth)}{% endcase %}`;
  }

  return [
    `${ind(ctx, depth)}{% case ${liquidPath} %}`,
    ...caseParts,
    `${ind(ctx, depth)}{% endcase %}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Phase 3: Component elements → {% render 'snippet-name' %}
// ---------------------------------------------------------------------------

/**
 * Renders a SolidJS component element as a Shopify Liquid render tag.
 *
 * <ProductCard />               → {% render 'product-card' %}
 * <PriceDisplay price={price} /> → {% render 'price-display', price: product.price | money %}
 *
 * Only JSX props whose values resolve to a Liquid expression are passed
 * as render tag variables. Client-side-only props (signals, event handlers)
 * are omitted — they are handled exclusively by the JS bundle.
 */
function renderComponent(element: AstNode, ctx: RenderContext, depth: number): string {
  const opening = element.openingElement as AstNode;
  const tagName = getJSXTagName(opening.name as AstNode)!;
  const snippetName = toKebabCase(tagName);
  const attrs = opening.attributes as AstNode[];

  // Section components are included with {% section %} and do not accept
  // parameters — they access Liquid globals (section.settings, etc.) directly.
  if (ctx.sectionComponents.has(tagName)) {
    return `${ind(ctx, depth)}{% section '${snippetName}' %}`;
  }

  const params: string[] = [];

  for (const attr of attrs) {
    if (!isJSXAttribute(attr)) continue; // skip spread attributes
    const nameNode = attr.name as AstNode;
    if (!isJSXIdentifier(nameNode)) continue;
    const propName = (nameNode as AstNode & { name: string }).name;

    // Skip event handlers, ref, key — client-side only
    if (propName.startsWith('on') || propName === 'ref' || propName === 'key') continue;

    const value = attr.value as AstNode | null;
    if (!value) continue;

    if (isJSXExpressionContainer(value)) {
      const expr = value.expression as AstNode;
      const liquidExpr = exprToLiquid(expr, ctx);
      if (liquidExpr) {
        // Strip {{ }} to get the bare Liquid path for the render tag parameter
        params.push(`${propName}: ${stripLiquidBraces(liquidExpr)}`);
      }
    }
  }

  // Shopify's {% render %} tag runs in an isolated scope — variables from the
  // parent template are not accessible, but explicit parameters are.
  // Detect which top-level Shopify objects the parent template references via
  // its tap() mappings (e.g. `product` from `{{ product.title }}`) and pass
  // them as render tag variables so snippets can use `{{ product.* }}` freely.
  const explicitPropNames = new Set(params.map((p) => p.split(':')[0].trim()));
  const contextObjects = new Set<string>();
  for (const liquidExpr of Object.values(ctx.mappings)) {
    const m = liquidExpr.match(/\{\{\s*([a-z_]\w+)\./);
    if (m) contextObjects.add(m[1]);
  }
  for (const obj of contextObjects) {
    if (!explicitPropNames.has(obj)) {
      params.push(`${obj}: ${obj}`);
    }
  }

  if (params.length === 0) {
    return `${ind(ctx, depth)}{% render '${snippetName}' %}`;
  }

  return `${ind(ctx, depth)}{% render '${snippetName}', ${params.join(', ')} %}`;
}

// ---------------------------------------------------------------------------
// Attributes
// ---------------------------------------------------------------------------

function renderAttributes(attrs: AstNode[], ctx: RenderContext): string[] {
  const result: string[] = [];

  for (const attr of attrs) {
    // JSXSpreadAttribute: {...blockAttrs()} → {{ block.shopify_attributes }}
    if (attr.type === 'JSXSpreadAttribute') {
      const arg = attr.argument as AstNode | undefined;
      if (
        arg &&
        isCallExpression(arg) &&
        isIdentifier(arg.callee) &&
        (arg.callee as AstNode & { name: string }).name === 'blockAttrs'
      ) {
        result.push('{{ block.shopify_attributes }}');
      }
      continue;
    }

    if (!isJSXAttribute(attr)) continue; // skip other non-attribute nodes

    const nameNode = attr.name as AstNode;
    if (!isJSXIdentifier(nameNode)) continue;

    const attrName = nameNode.name as string;

    // Skip event handlers, ref, key, classList — these are client-side.
    // classList is a SolidJS directive (not a valid HTML attribute) handled at runtime.
    if (attrName.startsWith('on') || attrName === 'ref' || attrName === 'key' || attrName === 'classList') continue;

    const value = attr.value as AstNode | null;

    if (!value) {
      result.push(attrName); // boolean attribute
      continue;
    }

    if (isStringLiteral(value)) {
      result.push(`${attrName}="${escapeAttr(value.value as string)}"`);
      continue;
    }

    if (isJSXExpressionContainer(value)) {
      const expr = value.expression as AstNode;

      // Template literal class: class={`static-classes ${dynamic}`} → class="static-classes"
      // Extracts the static quasis (literal string parts) so Liquid SSR includes
      // the base classes, preventing layout shift when dynamic parts are added client-side.
      if (attrName === 'class' && expr.type === 'TemplateLiteral') {
        const quasis = expr.quasis as AstNode[];
        const staticParts = quasis
          .map((q) => {
            const val = (q as AstNode & { value?: { raw?: string } }).value;
            return (val?.raw ?? '').trim();
          })
          .filter((s) => s.length > 0)
          .join(' ');
        if (staticParts) {
          result.push(`${attrName}="${escapeAttr(staticParts)}"`);
        }
        continue;
      }

      const liquidExpr = exprToLiquid(expr, ctx);
      if (liquidExpr) {
        result.push(`${attrName}="${sanitiseLiquidForAttr(liquidExpr)}"`);
      }
      // Non-liquid expression → skip (client-side binding)
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Expression rendering
// ---------------------------------------------------------------------------

/**
 * Renders a JSX expression container's expression as Liquid (or empty string).
 * Handles function-wrapped children like {() => <div>...</div>}.
 */
function renderExpression(expr: AstNode, ctx: RenderContext, depth: number): string {
  // Function-form children: {() => <jsx>} or {(value) => <jsx>}
  // Used inside <Show> accessor form or for raw JSX function expressions.
  if (isFunctionLike(expr)) {
    const body = extractFunctionBody(expr);
    if (body) return renderNode(body, ctx, depth);
    return '';
  }

  const liquid = exprToLiquid(expr, ctx);
  return liquid ?? '';
}

/**
 * Converts a JSX expression to its Liquid equivalent string.
 * Returns null for client-side-only expressions.
 */
function exprToLiquid(expr: AstNode, ctx: RenderContext): string | null {
  // Inline tap() call: {tap('{{ product.title }}', fallback)}
  if (isTapCall(expr)) {
    const liquidStr = (expr.arguments[0] as AstNode & { value: string }).value;
    return ensureLiquidOutput(liquidStr);
  }

  // Loop variable identifier: {image} inside a <For> body
  if (isIdentifier(expr) && ctx.loopVars.has(expr.name)) {
    return `{{ ${expr.name} }}`;
  }

  // Tap-mapped identifier: const title = tap(...); {title}
  if (isIdentifier(expr) && ctx.mappings[expr.name]) {
    return ensureLiquidOutput(ctx.mappings[expr.name]);
  }

  // props.children → {{ content_for_layout }} (layout slot)
  if (
    isMemberExpression(expr) &&
    isIdentifier(expr.object) &&
    (expr.object as AstNode & { name: string }).name === 'props' &&
    !expr.computed &&
    isIdentifier(expr.property) &&
    (expr.property as AstNode & { name: string }).name === 'children'
  ) {
    return '{{ content_for_layout }}';
  }

  // Member expression: {image.url}, {product.title} — resolved via resolveMemberPath
  const memberPath = resolveMemberPath(expr, ctx.mappings, ctx.loopVars);
  if (memberPath) return `{{ ${memberPath} }}`;

  // liquidRaw() → emit the string argument as-is, no {{ }} wrapping added
  if (
    isCallExpression(expr) &&
    isIdentifier(expr.callee) &&
    (expr.callee as AstNode & { name: string }).name === 'liquidRaw' &&
    expr.arguments.length >= 1
  ) {
    const arg = expr.arguments[0] as AstNode;
    if (isStringLiteral(arg)) {
      return (arg as AstNode & { value: string }).value;
    }
  }

  // t() translation call → {{ 'key' | t }}
  if (
    isCallExpression(expr) &&
    isIdentifier(expr.callee) &&
    expr.callee.name === 't' &&
    expr.arguments.length >= 1
  ) {
    const keyArg = expr.arguments[0] as AstNode;
    if (isStringLiteral(keyArg)) {
      return `{{ '${keyArg.value}' | t }}`;
    }
  }

  // Everything else (signals, complex expressions) — client-side only
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the JSX body from an arrow or regular function expression.
 * Handles expression bodies, parenthesized bodies, and block-body returns.
 */
function extractFunctionBody(fnNode: AstNode): AstNode | null {
  const body = fnNode.body as AstNode;
  if (!body) return null;

  // Direct JSX expression body: (item) => <div>...</div>
  if (isJSXElement(body) || isJSXFragment(body)) return body;

  // Parenthesized expression: (item) => (<div>...</div>)
  if (body.type === 'ParenthesizedExpression' && body.expression) {
    const inner = body.expression as AstNode;
    if (isJSXElement(inner) || isJSXFragment(inner)) return inner;
  }

  // Block body: (item) => { return <div>...</div>; }
  if (body.type === 'BlockStatement' && Array.isArray(body.body)) {
    for (const stmt of body.body as AstNode[]) {
      if (isReturnStatement(stmt) && stmt.argument) {
        let arg = stmt.argument as AstNode;
        if (arg.type === 'ParenthesizedExpression' && arg.expression) {
          arg = arg.expression as AstNode;
        }
        if (isJSXElement(arg) || isJSXFragment(arg)) return arg;
      }
    }
  }

  return null;
}

/** Finds a JSXAttribute by name in an attribute list. */
function findJSXAttr(attrs: AstNode[], name: string): AstNode | undefined {
  return attrs.find(
    (a) => isJSXAttribute(a) && isJSXIdentifier(a.name as AstNode) && (a.name as AstNode & { name: string }).name === name,
  );
}

/** Extracts the expression from a JSXAttribute whose value is a JSXExpressionContainer. */
function getJSXAttrExpr(attr: AstNode): AstNode | null {
  const value = attr.value as AstNode | null;
  if (!value) return null;
  if (isJSXExpressionContainer(value)) return value.expression as AstNode;
  return null;
}

/**
 * Ensures the liquid expression is wrapped in {{ }} when used in output context.
 * Bare references like 'product.title' become {{ product.title }}.
 * Already-wrapped '{{ product.title }}' and tags '{% ... %}' pass through.
 */
function ensureLiquidOutput(liquidStr: string): string {
  const trimmed = liquidStr.trim();
  if (trimmed.startsWith('{{') || trimmed.startsWith('{%')) return trimmed;
  return `{{ ${trimmed} }}`;
}

/**
 * Normalises a Liquid expression for safe use inside a double-quoted HTML attribute:
 * replaces double quotes inside {{ ... }} with single quotes and trims whitespace.
 *
 *   {{ product.featured_image | img_url: "600x" }}
 *     →  {{ product.featured_image | img_url: '600x' }}
 */
function sanitiseLiquidForAttr(liquidExpr: string): string {
  return liquidExpr.replace(/\{\{([^}]*)\}\}/g, (_, inner: string) => {
    return `{{ ${inner.trim().replace(/"/g, "'")} }}`;
  });
}

function renderChildren(children: AstNode[], ctx: RenderContext, depth: number): string {
  return children
    .map((child) => renderNode(child, ctx, depth))
    .filter((s) => s.trim().length > 0)
    .join('\n');
}

function renderJSXText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;');
}
