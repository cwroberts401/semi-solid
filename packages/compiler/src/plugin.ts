/**
 * plugin.ts
 *
 * Main Vite plugin entry point for Semi-Solid.
 *
 * During the build, this plugin intercepts .tsx/.jsx files and:
 *   1. Extracts tap() mappings
 *   2. Generates a .liquid file and writes it to the output directory
 *   3. Returns the cleaned source code (tap() replaced by fallbacks)
 *      for Vite/SolidJS to compile into the JS bundle
 *
 * Phase 1 handles: components in src/components/ → snippets/*.liquid
 * Phase 3 will add: routes in src/routes/ → templates/*.liquid
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { extractTapMappings } from './tap-extract.js';
import { generateLiquid } from './liquid-gen.js';
import { toKebabCase } from './ast-utils.js';
import { resolveRoute, getRoutesDir } from './route-map.js';
import { extractSectionSchema, formatSchemaTag } from './section-schema.js';
import {
  resolveLocaleFiles,
  resolveActiveLocalePath,
  virtualLocaleIds,
} from './i18n.js';
import {
  isInteractiveComponent,
  detectPropVars,
  generateDataProps,
  generateDataSection,
  generateHydrationEntry,
} from './hydration.js';
import {
  validateTapMappings,
  validateUnusedMappings,
  generateManifest,
} from './validation.js';
import { generateAssetIncludes } from './css.js';
import type { PersonalizationAssetOptions } from './css.js';
import type { TapMapping } from './tap-extract.js';

// ---------------------------------------------------------------------------
// Required Shopify theme files
// Shopify prevents these from being deleted from a live theme.
// The CLI will error if they are absent from the local theme directory.
// ---------------------------------------------------------------------------

const REQUIRED_THEME_FILES: Record<string, string> = {
  // layout/theme.liquid is generated from src/routes/+layout.tsx.
  // This minimal fallback ensures Shopify CLI never tries to delete the protected
  // remote file when a build error prevents generation of the real layout.
  'layout/theme.liquid': [
    `<!DOCTYPE html>`,
    `<html lang="{{ request.locale.iso_code }}">`,
    `<head>`,
    `  <meta charset="utf-8">`,
    `  {{ content_for_header }}`,
    `</head>`,
    `<body>`,
    `  {{ content_for_layout }}`,
    `</body>`,
    `</html>`,
    ``,
  ].join('\n'),

  // Every Shopify theme must have a gift card template.
  'templates/gift_card.liquid': [
    `<!DOCTYPE html>`,
    `<html lang="{{ request.locale.iso_code }}">`,
    `<head>`,
    `  <meta charset="utf-8">`,
    `  <title>{{ 'gift_cards.issued.title' | t }}</title>`,
    `  {{ content_for_header }}`,
    `</head>`,
    `<body>`,
    `  <div class="gift-card">`,
    `    <p>{{ gift_card.initial_value | money }}</p>`,
    `    <p>{{ gift_card.code }}</p>`,
    `  </div>`,
    `</body>`,
    `</html>`,
    ``,
  ].join('\n'),

  // Theme settings schema (empty = no settings).
  'config/settings_schema.json': '[]\n',

  // Theme settings data (empty current values).
  'config/settings_data.json': '{ "current": {} }\n',
};

export interface SemiSolidOptions {
  /** Brand identifier, e.g. 'brand-a' */
  brand: string;
  /** Locale identifier, e.g. 'en' */
  locale: string;
  /**
   * Output directory for the Shopify theme.
   * Defaults to `dist/${brand}/${locale}`.
   */
  outDir?: string;
  /**
   * Phase 12: external server personalization.
   * When configured, tapPersonalized() calls generate preconnect and prefetch
   * tags so the fetch starts as soon as the HTML parser hits <head>.
   */
  personalization?: {
    baseUrl: string;
    preconnect?: boolean;   // default true
    prefetch?: boolean;     // default true
  };
}

/**
 * Writes `content` to `filePath` only when the on-disk content differs.
 * Returns true if the file was written, false if it was already up-to-date.
 * Prevents spurious mtime changes that would re-trigger Vite's file watcher
 * and cause an infinite rebuild loop when emptyOutDir is false.
 */
function writeIfChanged(filePath: string, content: string): boolean {
  try {
    if (fs.readFileSync(filePath, 'utf-8') === content) return false;
  } catch {
    // File doesn't exist yet — fall through to write
  }
  fs.writeFileSync(filePath, content, 'utf-8');
  return true;
}

export function semiSolidPlugin(options: SemiSolidOptions): Plugin {
  const { brand, locale } = options;
  const outDir = options.outDir ?? `dist/${brand}/${locale}`;

  // Resolved absolute output dir — determined at configResolved time
  let resolvedOutDir = outDir;
  let projectRoot = process.cwd();

  // Tracks interactive components found during transform for entry generation
  const interactiveComponents: Array<{ name: string; importPath: string }> = [];

  // Pre-scanned interactive component names → source file paths.
  // Populated in buildStart so the virtual hydration-entry load() hook has the
  // full list before any module is loaded. Reset each build for watch mode.
  const interactiveComponentPaths = new Map<string, string>();

  // Maps component name → category ('snippets' | 'sections' | 'blocks') so
  // the hydration entry can generate the correct import alias.
  const componentCategories = new Map<string, string>();

  // Phase 7: track generated files for the build manifest
  const generatedTemplates: string[] = [];
  const generatedSnippets: string[] = [];
  const generatedSections: string[] = [];
  const generatedAssets: string[] = [];

  // Section component names (PascalCase). Populated in buildStart by scanning
  // for `export const schema = ...` in component files. Used by generateLiquid()
  // to emit {% section %} tags instead of {% render %} tags.
  const sectionComponentNames = new Set<string>();

  // Remote wrapper sections generated for tapRemote() calls.
  // Each entry is the wrapper section name, e.g. "remote-product-card".
  const remoteWrapperSections = new Set<string>();

  // Phase 12: personalized calls collected during transform.
  // Each entry stores the call info + the component's tap mappings for Liquid generation.
  const personalizedCallsCollected: Array<{
    url: string;
    params: Record<string, string>;
    componentMappings: TapMapping;
  }> = [];

  // CSS assets emitted by Vite/Tailwind, captured in generateBundle.
  // Keys are output-relative paths like 'assets/theme-abc123.css'.
  let emittedCSSAssets: string[] = [];

  return {
    name: 'semi-solid',

    // Run before vite-plugin-solid so we see the original JSX source, not
    // the already-compiled Solid runtime output.
    enforce: 'pre',

    configResolved(config) {
      projectRoot = config.root;
      resolvedOutDir = path.isAbsolute(outDir)
        ? outDir
        : path.resolve(projectRoot, outDir);
    },

    // -------------------------------------------------------------------------
    // Pre-scan component directories so the virtual hydration-entry load() hook
    // has the full interactive component list before any module is processed.
    // Must run in buildStart (not configResolved) because projectRoot is set in
    // configResolved and we need it resolved first.
    // -------------------------------------------------------------------------
    buildStart() {
      interactiveComponentPaths.clear();
      sectionComponentNames.clear();
      remoteWrapperSections.clear();
      // Reset per-build file lists so watch-mode rebuilds don't accumulate
      // duplicate entries — duplicates would change manifest.json every build
      // and re-trigger the watcher (infinite loop).
      generatedTemplates.length = 0;
      generatedSnippets.length = 0;
      generatedSections.length = 0;
      generatedAssets.length = 0;
      interactiveComponents.length = 0;
      personalizedCallsCollected.length = 0;
      componentCategories.clear();

      // Scan base category directories and brand override directories.
      const categories = ['snippets', 'sections', 'blocks'] as const;
      for (const category of categories) {
        const scanDirs = [
          path.join(projectRoot, 'src', category),
          path.join(projectRoot, 'src', 'brands', brand, category),
        ];
        for (const dir of scanDirs) {
          if (!fs.existsSync(dir)) continue;
          for (const file of fs.readdirSync(dir)) {
            if (!/\.(tsx|jsx)$/.test(file)) continue;
            const filePath = path.join(dir, file);
            try {
              const source = fs.readFileSync(filePath, 'utf-8');
              const name = path.basename(file).replace(/\.(tsx|jsx)$/, '');
              componentCategories.set(name, category);
              if (isInteractiveComponent(source)) {
                interactiveComponentPaths.set(name, filePath);
              }
              try {
                const schema = extractSectionSchema(source);
                if (schema !== null) {
                  sectionComponentNames.add(name);
                }
              } catch {
                // ignore schema parse errors during scan; they will surface at transform time
              }
            } catch {
              // ignore unreadable files
            }
          }
        }
      }
    },

    // -------------------------------------------------------------------------
    // Phase 5: virtual:semi-solid/locale — inlines the active locale JSON
    // into the JS bundle so the runtime t() function can call setTranslations.
    //
    // Usage in entry modules:
    //   import translations from 'virtual:semi-solid/locale';
    //   import { setTranslations } from '@semi-solid/runtime';
    //   setTranslations(translations);
    // -------------------------------------------------------------------------
    resolveId(id: string) {
      if (id === 'virtual:semi-solid/hydration-entry') return '\0virtual:semi-solid/hydration-entry';
      if (id === virtualLocaleIds.external) return virtualLocaleIds.internal;
      return null;
    },

    load(id: string) {
      // -----------------------------------------------------------------------
      // Virtual hydration entry — imported as 'virtual:semi-solid/hydration-entry'.
      // Vite bundles this module, so all imports (solid-js/web, $components/*)
      // are resolved and the output is a browser-compatible ES module.
      // -----------------------------------------------------------------------
      if (id === '\0virtual:semi-solid/hydration-entry') {
        const componentNames = [...interactiveComponentPaths.keys()];
        if (componentNames.length === 0) {
          return '// No interactive components\n';
        }
        const personalizationLines: string[] = [];
        if (options.personalization?.baseUrl) {
          personalizationLines.push(
            "import { __setPersonalizationBaseUrl } from '$lib/tapPersonalized';",
          );
        }
        const lines = [
          "import { render } from 'solid-js/web';",
          "import { __setSectionId } from '$lib/tapWhen';",
          ...personalizationLines,
          ...componentNames.map((n) => {
            const category = componentCategories.get(n) ?? 'snippets';
            return `import ${n} from '$${category}/${n}';`;
          }),
          '',
          // Set personalization base URL before any component mounts
          ...(options.personalization?.baseUrl
            ? [`__setPersonalizationBaseUrl(${JSON.stringify(options.personalization.baseUrl)});`, '']
            : []),
          'const registry = {',
          ...componentNames.map((n) => `  '${n}': ${n},`),
          '};',
          '',
          "document.querySelectorAll('[data-component]').forEach((el) => {",
          "  const name = el.getAttribute('data-component');",
          '  const Component = registry[name];',
          '  if (!Component) return;',
          "  const props = JSON.parse(el.getAttribute('data-props') || '{}');",
          '  // Clear Liquid SSR content before mounting — SolidJS render() appends',
          '  // rather than replaces, so without this the SSR HTML stays alongside',
          '  // the newly mounted component, producing duplicate content.',
          "  el.textContent = '';",
          '  // Set the active section ID before render() so createTapSignal() can',
          '  // capture it synchronously at component initialisation time.',
          "  __setSectionId(el.getAttribute('data-section-id'));",
          '  render(() => Component(props), el);',
          '  __setSectionId(undefined);',
          '});',
        ];
        return lines.join('\n') + '\n';
      }

      if (id !== virtualLocaleIds.internal) return null;
      const localePath = resolveActiveLocalePath(brand, locale, projectRoot);
      if (localePath) {
        const json = fs.readFileSync(localePath, 'utf-8');
        return `export default ${json};`;
      }
      return 'export default {};';
    },

    // -------------------------------------------------------------------------
    // Capture CSS assets emitted by Vite/Tailwind so buildEnd can reference
    // the correct hashed filenames in snippets/theme-assets.liquid.
    // -------------------------------------------------------------------------
    generateBundle(_outputOptions, bundle) {
      emittedCSSAssets = [];
      for (const [fileName, asset] of Object.entries(bundle)) {
        if (asset.type === 'asset' && fileName.endsWith('.css')) {
          emittedCSSAssets.push(fileName);
        }
      }
    },

    // -------------------------------------------------------------------------
    // Phase 5: copy locale JSON files to dist/{brand}/{locale}/locales/
    // Phase 6: write assets/theme.entry.js for interactive components
    //
    // NOTE: Must use closeBundle (not buildEnd) because CSS assets are emitted
    // during the output generation phase (generateBundle), which runs AFTER
    // buildEnd. closeBundle fires after all output has been written, so
    // emittedCSSAssets is fully populated when we need it here.
    // -------------------------------------------------------------------------
    closeBundle() {
      const pairs = resolveLocaleFiles(brand, locale, projectRoot, resolvedOutDir);
      for (const { src, dest } of pairs) {
        try {
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          const localeContent = fs.readFileSync(src, 'utf-8');
          if (writeIfChanged(dest, localeContent)) {
            this.info(
              `semi-solid: copied locale ${path.basename(src)} → ${path.relative(projectRoot, dest)}`,
            );
          }
        } catch (err) {
          this.warn(
            `semi-solid: failed to copy locale file ${src}: ${(err as Error).message}`,
          );
        }
      }

      // Phase 7: CSS assets are now emitted by Vite/Tailwind during the bundle
      // phase and already written to disk. Collect their basenames for the
      // theme-assets snippet; add them to the manifest asset list.
      const cssAssetNames: string[] = [];
      for (const cssPath of emittedCSSAssets) {
        const baseName = path.basename(cssPath);
        cssAssetNames.push(baseName);
        generatedAssets.push(cssPath);
        this.info(`semi-solid: CSS asset from Vite → ${cssPath}`);
      }

      // Phase 6: theme.entry.js is now produced by Vite as a bundled entry
      // point (virtual:semi-solid/hydration-entry in rollupOptions.input).
      // Vite resolves solid-js/web and the $components/* imports, so the
      // browser receives a proper ES module with no bare specifiers.
      if (interactiveComponentPaths.size > 0) {
        generatedAssets.push('assets/theme.entry.js');
        this.info(
          `semi-solid: theme.entry.js bundled by Vite (${interactiveComponentPaths.size} interactive component${interactiveComponentPaths.size === 1 ? '' : 's'})`,
        );
      }

      // Phase 7: write required Shopify theme files if they are absent.
      // These files cannot be deleted from a live theme, so the Shopify CLI
      // will error when syncing if they exist on the remote but not locally.
      for (const [relPath, content] of Object.entries(REQUIRED_THEME_FILES)) {
        const fullPath = path.join(resolvedOutDir, relPath);
        if (!fs.existsSync(fullPath)) {
          try {
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, content, 'utf-8');
            this.info(`semi-solid: wrote required file ${relPath}`);
          } catch (err) {
            this.warn(
              `semi-solid: failed to write ${relPath}: ${(err as Error).message}`,
            );
          }
        }
      }

      // Phase 7: generate snippets/theme-assets.liquid with CSS + JS includes
      // Include in your layout <head>: {% render 'theme-assets' %}
      const jsAssetNames = interactiveComponentPaths.size > 0 ? ['theme.entry.js'] : [];
      // Phase 12: build personalization asset options for preconnect + prefetch
      let personalizationAssets: PersonalizationAssetOptions | undefined;
      if (options.personalization?.baseUrl && personalizedCallsCollected.length > 0) {
        personalizationAssets = {
          baseUrl: options.personalization.baseUrl,
          preconnect: options.personalization.preconnect ?? true,
          prefetch: options.personalization.prefetch ?? true,
          calls: personalizedCallsCollected,
        };
      }
      const hasPersonalization = !!personalizationAssets;
      if (cssAssetNames.length > 0 || jsAssetNames.length > 0 || hasPersonalization) {
        const assetSnippet = generateAssetIncludes(cssAssetNames, jsAssetNames, personalizationAssets) + '\n';
        const snippetsDir = path.join(resolvedOutDir, 'snippets');
        try {
          fs.mkdirSync(snippetsDir, { recursive: true });
          const snippetPath = path.join(snippetsDir, 'theme-assets.liquid');
          writeIfChanged(snippetPath, assetSnippet);
          generatedSnippets.push('snippets/theme-assets.liquid');
          this.info(`semi-solid: wrote snippets/theme-assets.liquid`);
        } catch (err) {
          this.warn(
            `semi-solid: failed to write theme-assets.liquid: ${(err as Error).message}`,
          );
        }
      }

      // Copy JSON templates from src/templates/ to dist/templates/.
      // Brand-specific templates in src/brands/{brand}/templates/ override base ones.
      const baseTemplatesDir = path.join(projectRoot, 'src', 'templates');
      const brandTemplatesDir = path.join(projectRoot, 'src', 'brands', brand, 'templates');
      const templateFileMap = new Map<string, string>(); // filename → source path
      for (const dir of [baseTemplatesDir, brandTemplatesDir]) {
        if (!fs.existsSync(dir)) continue;
        for (const file of fs.readdirSync(dir)) {
          if (!file.endsWith('.json')) continue;
          templateFileMap.set(file, path.join(dir, file));
        }
      }
      if (templateFileMap.size > 0) {
        const destDir = path.join(resolvedOutDir, 'templates');
        fs.mkdirSync(destDir, { recursive: true });
        for (const [file, srcPath] of templateFileMap) {
          const content = fs.readFileSync(srcPath, 'utf-8');
          writeIfChanged(path.join(destDir, file), content);
          generatedTemplates.push(`templates/${file}`);
          const isBrandOverride = srcPath.startsWith(brandTemplatesDir);
          this.info(`semi-solid: copied templates/${file}${isBrandOverride ? ` (brand: ${brand})` : ''}`);
        }
      }

      // Phase 7: write build manifest
      try {
        const localeFiles = resolveLocaleFiles(brand, locale, projectRoot, resolvedOutDir)
          .map(({ dest }) => path.relative(resolvedOutDir, dest));
        const manifest = generateManifest(brand, locale, {
          templates: generatedTemplates,
          snippets: generatedSnippets,
          sections: generatedSections,
          assets: generatedAssets,
          locales: localeFiles,
        });
        fs.mkdirSync(resolvedOutDir, { recursive: true });
        writeIfChanged(
          path.join(resolvedOutDir, 'manifest.json'),
          JSON.stringify(manifest, null, 2) + '\n',
        );
        this.info(`semi-solid: wrote manifest.json`);
      } catch (err) {
        this.warn(`semi-solid: failed to write manifest.json: ${(err as Error).message}`);
      }
    },

    transform(code, id) {
      // Only handle .tsx and .jsx files inside src/
      if (!id.includes(`${path.sep}src${path.sep}`) && !id.includes('/src/')) {
        return null;
      }
      if (!id.endsWith('.tsx') && !id.endsWith('.jsx')) {
        return null;
      }

      const componentName = path.basename(id).replace(/\.(tsx|jsx|ts|js)$/, '');

      // -----------------------------------------------------------------------
      // Layout file → layout/theme.liquid
      // Only +layout.tsx is processed from routes/; page templates are now
      // JSON files in templates/ (copied in closeBundle).
      // -----------------------------------------------------------------------
      if (id.includes(`${path.sep}routes${path.sep}`) || id.includes('/routes/')) {
        const basename = path.basename(id).replace(/\.(tsx|jsx|ts|js)$/, '');
        if (basename !== '+layout') return null; // only process layout

        const routesDir = getRoutesDir(projectRoot);
        const routeInfo = resolveRoute(id, routesDir);

        if (!routeInfo) {
          this.warn(`semi-solid: unrecognized route file: ${id}`);
          return null;
        }

        const { mappings, cleanedSource, sourceMap, warnings } = extractTapMappings(code, id);
        for (const warning of warnings) {
          this.warn(warning);
        }

        // Validate that tap() mappings only use objects in the layout context
        for (const warn of validateTapMappings(mappings, routeInfo.context)) {
          this.warn(`semi-solid: ${warn.message}`);
        }

        let liquidContent: string;
        try {
          liquidContent = generateLiquid(code, mappings, {
            componentName,
            sectionComponents: sectionComponentNames,
          });
        } catch (err) {
          this.warn(
            `semi-solid: failed to generate liquid for ${id}: ${(err as Error).message}`,
          );
          return { code: cleanedSource, map: sourceMap };
        }

        // Warn on tap() variables that never made it into the liquid output
        for (const warn of validateUnusedMappings(mappings, liquidContent)) {
          this.warn(`semi-solid: ${warn.message}`);
        }

        const outputPath = path.join(resolvedOutDir, routeInfo.outputPath);
        try {
          fs.mkdirSync(path.dirname(outputPath), { recursive: true });
          writeIfChanged(outputPath, liquidContent);
          generatedTemplates.push(routeInfo.outputPath);
          this.info(`semi-solid: wrote ${path.relative(projectRoot, outputPath)}`);
        } catch (err) {
          this.warn(
            `semi-solid: failed to write liquid for ${id}: ${(err as Error).message}`,
          );
        }

        return { code: cleanedSource, map: sourceMap };
      }

      // -----------------------------------------------------------------------
      // Component files → snippets/*.liquid
      // -----------------------------------------------------------------------
      const { mappings, cleanedSource, sourceMap, warnings, reactiveVars, remoteComponents, personalizedCalls } = extractTapMappings(code, id);

      for (const warning of warnings) {
        this.warn(warning);
      }

      // Phase 12: collect tapPersonalized() calls for prefetch generation
      for (const call of personalizedCalls) {
        personalizedCallsCollected.push({
          url: call.url,
          params: call.params,
          componentMappings: mappings,
        });
      }

      // Generate wrapper sections for tapRemote() calls
      for (const compName of remoteComponents) {
        const wrapperName = `remote-${toKebabCase(compName)}`;
        if (!remoteWrapperSections.has(wrapperName)) {
          remoteWrapperSections.add(wrapperName);
          const wrapperContent = `{% render '${toKebabCase(compName)}' %}\n`;
          const sectionsDir = path.join(resolvedOutDir, 'sections');
          try {
            fs.mkdirSync(sectionsDir, { recursive: true });
            writeIfChanged(path.join(sectionsDir, `${wrapperName}.liquid`), wrapperContent);
            generatedSections.push(`sections/${wrapperName}.liquid`);
            this.info(`semi-solid: wrote sections/${wrapperName}.liquid (remote wrapper)`);
          } catch (err) {
            this.warn(
              `semi-solid: failed to write remote wrapper section ${wrapperName}: ${(err as Error).message}`,
            );
          }
        }
      }

      // Only generate liquid if the component has tap() mappings
      if (Object.keys(mappings).length === 0) {
        return null;
      }

      // Phase 6: detect interactivity and compute hydration data-props.
      // Pass ALL tap-mapped variables (not just event-handler vars) so the
      // SolidJS component receives the server-rendered values and doesn't
      // fall back to placeholder strings after hydration replaces SSR content.
      const kebabName = toKebabCase(componentName);
      let dataProps: string | undefined;
      let dataSectionId: string | undefined;

      if (isInteractiveComponent(code)) {
        const propVars = Object.keys(mappings);
        dataProps = generateDataProps(propVars, mappings);
        interactiveComponents.push({
          name: componentName,
          importPath: `./${kebabName}.js`,
        });

        // tapWhen() calls require a companion JSON data section so the runtime
        // can re-fetch values when dep signals change.
        if (reactiveVars.size > 0) {
          dataSectionId = `${kebabName}-data`;
          const dataSectionContent = generateDataSection(propVars, mappings);
          const sectionsDir = path.join(resolvedOutDir, 'sections');
          try {
            fs.mkdirSync(sectionsDir, { recursive: true });
            const dataSectionPath = path.join(sectionsDir, `${dataSectionId}.liquid`);
            writeIfChanged(dataSectionPath, dataSectionContent);
            generatedSnippets.push(`sections/${dataSectionId}.liquid`);
            this.info(`semi-solid: wrote sections/${dataSectionId}.liquid`);
          } catch (err) {
            this.warn(
              `semi-solid: failed to write data section for ${id}: ${(err as Error).message}`,
            );
          }
        }
      }

      const liquidFileName = kebabName + '.liquid';

      let liquidContent: string;
      try {
        liquidContent = generateLiquid(code, mappings, {
          componentName,
          dataProps,
          dataSectionId,
          sectionComponents: sectionComponentNames,
        });
      } catch (err) {
        this.warn(
          `semi-solid: failed to generate liquid for ${id}: ${(err as Error).message}`,
        );
        return { code: cleanedSource, map: sourceMap };
      }

      // Phase 7: warn on tap() variables that never made it into the liquid output
      for (const warn of validateUnusedMappings(mappings, liquidContent)) {
        this.warn(`semi-solid: ${warn.message}`);
      }

      // Detect schema export → write to sections/ with {% schema %} tag;
      // otherwise write to snippets/ as before.
      let isSection = false;
      try {
        const schema = extractSectionSchema(code);
        if (schema !== null) {
          isSection = true;
          liquidContent += '\n' + formatSchemaTag(schema);
          sectionComponentNames.add(componentName);
          const sectionsDir = path.join(resolvedOutDir, 'sections');
          fs.mkdirSync(sectionsDir, { recursive: true });
          const liquidPath = path.join(sectionsDir, liquidFileName);
          writeIfChanged(liquidPath, liquidContent);
          generatedSections.push(`sections/${liquidFileName}`);
          this.info(`semi-solid: wrote sections/${liquidFileName} (section)`);
        }
      } catch (err) {
        this.warn(
          `semi-solid: failed to extract/write section schema for ${id}: ${(err as Error).message}`,
        );
      }

      if (!isSection) {
        const snippetsDir = path.join(resolvedOutDir, 'snippets');
        try {
          fs.mkdirSync(snippetsDir, { recursive: true });
          const liquidPath = path.join(snippetsDir, liquidFileName);
          writeIfChanged(liquidPath, liquidContent);
          generatedSnippets.push(`snippets/${liquidFileName}`);
          this.info(`semi-solid: wrote ${path.relative(projectRoot, liquidPath)}`);
        } catch (err) {
          this.warn(
            `semi-solid: failed to write liquid for ${id}: ${(err as Error).message}`,
          );
        }
      }

      // Return the cleaned source for Vite/SolidJS to continue compiling
      return {
        code: cleanedSource,
        map: sourceMap,
      };
    },
  };
}

