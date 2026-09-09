// Remove dist-electron/ before a production build.
//
// vite-plugin-electron runs two separate sub-builds (main + preload) that both emit into
// dist-electron/, so neither can set emptyOutDir without deleting the other's output.
// Hashed chunks therefore pile up forever — the directory had 26 dead main-*.js files
// (~27k lines each) before this script existed, which also wrecked vitest's coverage
// denominator. Cleaning once up front, before either sub-build starts, is the fix.

import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const target = join(__dirname, '..', 'dist-electron');

rmSync(target, { recursive: true, force: true });
console.log('[clean] removed dist-electron/');
