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
    '  <title>{{ \'gift_cards.issued.title\' | t }}</title>',
    '  {{ content_for_header }}',
    '</head>',
    '<body>',
    '  <div class="gift-card">',
    '    <p>{{ gift_card.initial_value | money }}</p>',
    '    <p>{{ gift_card.code }}</p>',
    '  </div>',
    '</body>',
    '</html>',
    '',
  ].join('\n'),
  'config/settings_schema.json': '[]\n',
  'config/settings_data.json': '{ "current": {} }\n',
};

type BackfillTarget = 'locales' | 'templates' | 'scaffold';

const VALID_TARGETS: BackfillTarget[] = ['locales', 'templates', 'scaffold'];

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
      description: 'Comma-separated targets: locales, templates, scaffold',
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
