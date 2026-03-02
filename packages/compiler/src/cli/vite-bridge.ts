import { build } from 'vite';

export interface BuildOptions {
  brand: string;
  locale: string;
}

export async function runBuild(opts: BuildOptions): Promise<void> {
  process.env.BRAND = opts.brand;
  process.env.LOCALE = opts.locale;
  await build();
}

export async function runWatchBuild(opts: BuildOptions): Promise<void> {
  process.env.BRAND = opts.brand;
  process.env.LOCALE = opts.locale;
  await build({ build: { watch: {} } });
}
