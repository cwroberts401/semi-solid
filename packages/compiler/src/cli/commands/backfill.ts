import { defineCommand } from 'citty';
import fs from 'node:fs';
import path from 'node:path';
import { resolveLocaleFiles } from '../../i18n.js';

const REQUIRED_THEME_FILES: Record<string, string> = {
  'layout/theme.liquid': [
    '<!DOCTYPE html>',
    '<html lang="{{ request.locale.iso_code }}">',
    '<head>',
    '  <meta charset="utf-8">',
    '  {{ content_for_header }}',
    '</head>',
    '<body>',
    '  {{ content_for_layout }}',
    '</body>',
    '</html>',
    '',
  ].join('\n'),
  'templates/gift_card.liquid': [
    '<!DOCTYPE html>',
    '<html lang="{{ request.locale.iso_code }}">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    '  <title>{{ \'gift_cards.issued.title\' | t }} — {{ shop.name }}</title>',
    '  {{ content_for_header }}',
    '  {% render \'theme-assets\' %}',
    '</head>',
    '<body class="gift-card-page">',
    '  <header class="text-center py-8">',
    '    <a href="{{ shop.url }}">',
    '      <h1>{{ shop.name }}</h1>',
    '    </a>',
    '  </header>',
    '  <main class="gift-card max-w-md mx-auto px-4 text-center">',
    '    <h2>{{ \'gift_cards.issued.subtext\' | t }}</h2>',
    '    {% if gift_card.enabled %}',
    '      <p class="gift-card__amount text-4xl font-bold my-4">{{ gift_card.initial_value | money }}</p>',
    '      {% if gift_card.balance != gift_card.initial_value %}',
    '        <p>{{ \'gift_cards.issued.remaining_html\' | t: balance: gift_card.balance | money }}</p>',
    '      {% endif %}',
    '      <div class="gift-card__code my-6">',
    '        <input type="text" value="{{ gift_card.code | format_code }}" class="text-center border rounded px-4 py-3 w-full text-lg tracking-widest" readonly onfocus="this.select();">',
    '      </div>',
    '      {% if gift_card.pass_url %}',
    '        <a href="{{ gift_card.pass_url }}" class="inline-block mb-4">',
    '          <img src="{{ \'gift-card/add-to-apple-wallet.svg\' | shopify_asset_url }}" alt="{{ \'gift_cards.issued.add_to_apple_wallet\' | t }}" width="120">',
    '        </a>',
    '      {% endif %}',
    '      <p class="text-sm text-gray-500">{{ \'gift_cards.issued.expiry_html\' | t: expires: gift_card.expires_on | date: "%B %d, %Y" }}</p>',
    '    {% else %}',
    '      <p>{{ \'gift_cards.issued.disabled\' | t }}</p>',
    '    {% endif %}',
    '    <a href="{{ shop.url }}" class="inline-block mt-8 bg-primary text-white px-8 py-3 rounded">{{ \'gift_cards.issued.shop_link\' | t }}</a>',
    '  </main>',
    '</body>',
    '</html>',
    '',
  ].join('\n'),
  'config/settings_schema.json': JSON.stringify(
    [
      {
        name: 'theme_info',
        theme_name: 'Semi-Solid',
        theme_version: '1.0.0',
        theme_author: 'Semi-Solid',
        theme_documentation_url: 'https://github.com/CarlR100/semi-solid',
        theme_support_url: 'https://github.com/CarlR100/semi-solid',
      },
      {
        name: 'Colors',
        settings: [
          { type: 'color', id: 'color_primary', label: 'Primary', default: '#111827' },
          { type: 'color', id: 'color_secondary', label: 'Secondary', default: '#6b7280' },
          { type: 'color', id: 'color_background', label: 'Background', default: '#ffffff' },
          { type: 'color', id: 'color_text', label: 'Text', default: '#111827' },
        ],
      },
      {
        name: 'Typography',
        settings: [
          { type: 'font_picker', id: 'heading_font', label: 'Heading font', default: 'assistant_n4' },
          { type: 'font_picker', id: 'body_font', label: 'Body font', default: 'assistant_n4' },
        ],
      },
      {
        name: 'Layout',
        settings: [
          { type: 'range', id: 'page_width', label: 'Page width', default: 1200, min: 1000, max: 1600, step: 100, unit: 'px' },
        ],
      },
    ],
    null,
    2,
  ) + '\n',
  'config/settings_data.json': [
    '// This file is auto-generated. Edit config/settings_schema.json for schema.',
    '{ "current": {} }',
    '',
  ].join('\n'),
};

type BackfillTarget = 'locales' | 'templates' | 'scaffold' | 'theme';

const VALID_TARGETS: BackfillTarget[] = ['locales', 'templates', 'scaffold', 'theme'];

export const backfillCommand = defineCommand({
  meta: {
    name: 'backfill',
    description: 'Targeted regeneration of specific outputs without a full Vite build',
  },
  args: {
    brand: {
      type: 'string',
      description: 'Brand identifier (e.g. brand-a)',
      required: true,
    },
    locale: {
      type: 'string',
      description: 'Locale identifier (e.g. en)',
      required: true,
    },
    target: {
      type: 'string',
      description: 'Comma-separated targets: locales, templates, scaffold, theme',
      required: true,
    },
  },
  async run({ args }) {
    const { brand, locale } = args;
    const root = process.cwd();
    const outDir = path.resolve(root, 'dist', brand, locale);

    const targets = args.target.split(',').map((t) => t.trim()) as BackfillTarget[];
    for (const t of targets) {
      if (!VALID_TARGETS.includes(t)) {
        console.error(`Invalid target: "${t}". Valid targets: ${VALID_TARGETS.join(', ')}`);
        process.exit(1);
      }
    }

    console.log(`Backfilling ${targets.join(', ')} for ${brand}/${locale}...`);

    if (targets.includes('locales')) {
      backfillLocales(brand, locale, root, outDir);
    }

    if (targets.includes('templates')) {
      backfillTemplates(brand, root, outDir);
    }

    if (targets.includes('scaffold')) {
      backfillScaffold(outDir);
    }

    if (targets.includes('theme')) {
      backfillTheme(brand, root, outDir);
    }

    console.log('Backfill complete.');
  },
});

function backfillLocales(brand: string, locale: string, root: string, outDir: string) {
  const pairs = resolveLocaleFiles(brand, locale, root, outDir);
  if (pairs.length === 0) {
    console.log('  No locale files found.');
    return;
  }

  for (const { src, dest } of pairs) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log(`  Copied ${path.basename(src)} → ${path.relative(root, dest)}`);
  }
}

function backfillTemplates(brand: string, root: string, outDir: string) {
  const baseDir = path.join(root, 'src', 'templates');
  const brandDir = path.join(root, 'src', 'brands', brand, 'templates');
  const destDir = path.join(outDir, 'templates');

  const templateMap = new Map<string, string>();

  for (const dir of [baseDir, brandDir]) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      templateMap.set(file, path.join(dir, file));
    }
  }

  if (templateMap.size === 0) {
    console.log('  No template files found.');
    return;
  }

  fs.mkdirSync(destDir, { recursive: true });
  for (const [file, src] of templateMap) {
    fs.copyFileSync(src, path.join(destDir, file));
    console.log(`  Copied templates/${file}`);
  }
}

function backfillScaffold(outDir: string) {
  for (const [relPath, content] of Object.entries(REQUIRED_THEME_FILES)) {
    const fullPath = path.join(outDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
    console.log(`  Wrote ${relPath}`);
  }
}

function backfillTheme(brand: string, root: string, outDir: string) {
  const baseThemeDir = path.join(root, 'src', 'theme');
  const brandThemeDir = path.join(root, 'src', 'brands', brand, 'theme');

  let copied = 0;
  for (const themeDir of [baseThemeDir, brandThemeDir]) {
    if (!fs.existsSync(themeDir)) continue;
    const copyDir = (dir: string, relBase: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const srcPath = path.join(dir, entry.name);
        const relPath = path.join(relBase, entry.name);
        if (entry.isDirectory()) {
          copyDir(srcPath, relPath);
        } else {
          const destPath = path.join(outDir, relPath);
          // Skip if file already exists (generated files take precedence)
          if (fs.existsSync(destPath)) continue;
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.copyFileSync(srcPath, destPath);
          console.log(`  Copied theme/${relPath}${themeDir === brandThemeDir ? ` (brand: ${brand})` : ''}`);
          copied++;
        }
      }
    };
    copyDir(themeDir, '');
  }

  if (copied === 0) {
    console.log('  No theme files to copy.');
  }
}
