import { defineCommand, runMain as cittyRunMain } from 'citty';
import { buildCommand } from './commands/build.js';
import { buildAllCommand } from './commands/build-all.js';
import { devCommand } from './commands/dev.js';
import { backfillCommand } from './commands/backfill.js';

const main = defineCommand({
  meta: {
    name: 'semi-solid',
    description: 'Semi-Solid CLI — build Shopify themes from SolidJS components',
  },
  subCommands: {
    build: buildCommand,
    'build-all': buildAllCommand,
    dev: devCommand,
    backfill: backfillCommand,
  },
});

export function runMain() {
  cittyRunMain(main);
}
