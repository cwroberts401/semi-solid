/**
 * section-schema.test.ts
 *
 * Unit tests for schema extraction and Liquid schema tag serialisation.
 */

import { describe, it, expect } from 'vitest';
import { extractSectionSchema, formatSchemaTag, evaluateAstValue } from '../src/section-schema';

// ---------------------------------------------------------------------------
// extractSectionSchema()
// ---------------------------------------------------------------------------

describe('extractSectionSchema()', () => {
  it('returns null when there is no schema export', () => {
    const source = `
      export default function Comp() {
        return <div>hello</div>;
      }
    `;
    expect(extractSectionSchema(source)).toBeNull();
  });

  it('returns null for a named export that is not called schema', () => {
    const source = `
      export const config = { name: 'Not a schema' };
      export default function Comp() { return <div />; }
    `;
    expect(extractSectionSchema(source)).toBeNull();
  });

  it('extracts a simple schema with string settings', () => {
    const source = `
      export const schema = {
        name: 'My Section',
        settings: [
          { type: 'text', id: 'heading', label: 'Heading', default: 'Hello' },
        ],
      };
      export default function Comp() { return <div />; }
    `;
    const result = extractSectionSchema(source);
    expect(result).not.toBeNull();
    expect(result).toEqual({
      name: 'My Section',
      settings: [
        { type: 'text', id: 'heading', label: 'Heading', default: 'Hello' },
      ],
    });
  });

  it('extracts a schema with nested blocks array', () => {
    const source = `
      export const schema = {
        name: 'Featured Product',
        blocks: [
          {
            type: 'item',
            name: 'Item',
            settings: [
              { type: 'text', id: 'title', label: 'Title' },
            ],
          },
        ],
        max_blocks: 6,
      };
    `;
    const result = extractSectionSchema(source);
    expect(result).toEqual({
      name: 'Featured Product',
      blocks: [
        {
          type: 'item',
          name: 'Item',
          settings: [{ type: 'text', id: 'title', label: 'Title' }],
        },
      ],
      max_blocks: 6,
    });
  });

  it('handles `as const` type assertion on schema', () => {
    const source = `
      export const schema = {
        name: 'With Const',
        settings: [],
      } as const;
    `;
    const result = extractSectionSchema(source);
    expect(result).toEqual({ name: 'With Const', settings: [] });
  });

  it('handles `satisfies` type assertion on schema', () => {
    const source = `
      interface SectionSchema { name: string; settings: unknown[] }
      export const schema = {
        name: 'With Satisfies',
        settings: [],
      } satisfies SectionSchema;
    `;
    const result = extractSectionSchema(source);
    expect(result).toEqual({ name: 'With Satisfies', settings: [] });
  });

  it('extracts numeric values', () => {
    const source = `
      export const schema = {
        max_blocks: 12,
        min_blocks: 0,
        limit: -1,
      };
    `;
    const result = extractSectionSchema(source);
    expect(result).toEqual({ max_blocks: 12, min_blocks: 0, limit: -1 });
  });

  it('extracts boolean values', () => {
    const source = `
      export const schema = {
        enabled: true,
        disabled: false,
      };
    `;
    const result = extractSectionSchema(source);
    expect(result).toEqual({ enabled: true, disabled: false });
  });

  it('handles presets array', () => {
    const source = `
      export const schema = {
        name: 'Hero',
        presets: [{ name: 'Hero' }],
      };
    `;
    const result = extractSectionSchema(source);
    expect(result).toEqual({ name: 'Hero', presets: [{ name: 'Hero' }] });
  });
});

// ---------------------------------------------------------------------------
// evaluateAstValue() — error cases
// ---------------------------------------------------------------------------

describe('evaluateAstValue() error cases', () => {
  it('throws for unsupported node types in schema', () => {
    const source = `
      const fn = () => 'hello';
      export const schema = {
        name: fn(),
      };
    `;
    // fn() is a CallExpression which is not supported
    expect(() => extractSectionSchema(source)).toThrow(/Unsupported AST node type/);
  });

  it('throws for template literals with expressions in schema', () => {
    const source = `
      const x = 'world';
      export const schema = {
        name: \`hello \${x}\`,
      };
    `;
    expect(() => extractSectionSchema(source)).toThrow(/TemplateLiteral with expressions/);
  });
});

// ---------------------------------------------------------------------------
// formatSchemaTag()
// ---------------------------------------------------------------------------

describe('formatSchemaTag()', () => {
  it('wraps the schema in {% schema %}…{% endschema %}', () => {
    const obj = { name: 'Test', settings: [] };
    const output = formatSchemaTag(obj);
    expect(output).toContain('{% schema %}');
    expect(output).toContain('{% endschema %}');
    expect(output).toContain('"name": "Test"');
    expect(output).toContain('"settings": []');
  });

  it('uses 2-space indented JSON', () => {
    const obj = { name: 'A', max_blocks: 4 };
    const output = formatSchemaTag(obj);
    // JSON.stringify with null, 2 indentation
    expect(output).toContain('  "name": "A"');
    expect(output).toContain('  "max_blocks": 4');
  });

  it('ends with a trailing newline', () => {
    const output = formatSchemaTag({ name: 'X' });
    expect(output.endsWith('\n')).toBe(true);
  });

  it('produces a complete schema tag', () => {
    const obj = { name: 'Featured Product', settings: [] };
    const output = formatSchemaTag(obj);
    expect(output).toBe(
      '{% schema %}\n' +
      JSON.stringify(obj, null, 2) +
      '\n{% endschema %}\n',
    );
  });
});
