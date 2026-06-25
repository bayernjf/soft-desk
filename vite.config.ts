import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { traeBadgePlugin } from 'vite-plugin-trae-solo-badge';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = loadEnv('', process.cwd(), 'VITE');

// https://vite.dev/config/
export default defineConfig({
  // 固定 dev 端口并禁止自动切换:Electron 的 localStorage 按 origin(含端口)隔离,
  // 端口漂移会导致换到全新的空 localStorage,引发"重启后配置丢失"的假象。
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    sourcemap: 'hidden',
  },
  plugins: [
    react({
      babel: {
        plugins: [
          'react-dev-locator',
        ],
      },
    }),
    traeBadgePlugin({
      variant: 'dark',
      position: 'bottom-right',
      prodOnly: true,
      clickable: true,
      clickUrl: 'https://www.trae.ai/solo?showJoin=1',
      autoTheme: true,
      autoThemeTarget: '#root'
    }),
    tsconfigPaths(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: { external: ['electron', 'better-sqlite3', 'ws'] },
          },
          define: {
            'process.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL ?? ''),
            'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY ?? ''),
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(args) {
          args.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            lib: {
              entry: 'electron/preload.ts',
              formats: ['cjs'],
              fileName: () => 'preload.cjs',
            },
            rollupOptions: {
              external: ['electron'],
            },
          },
          plugins: [
            {
              name: 'preload-force-cjs',
              // vite-plugin-electron 的 lib+cjs 在本插件版本下会产出混入 ESM 语法、
              // 且带重复尾巴的损坏代码,导致 sandbox preload 报 SyntaxError。
              // 这里在写盘后重建一份纯净 CJS:把 import 改为 require,并通过括号配平
              // 只保留 exposeInMainWorld 这一段完整调用,丢弃其后的重复垃圾代码。
              closeBundle() {
                const file = path.join(__dirname, 'dist-electron', 'preload.cjs');
                try {
                  const raw = readFileSync(file, 'utf-8');
                  const start = raw.indexOf('exposeInMainWorld');
                  if (start === -1) return;
                  const parenStart = raw.indexOf('(', start);
                  let depth = 0;
                  let end = -1;
                  for (let i = parenStart; i < raw.length; i++) {
                    const ch = raw[i];
                    if (ch === '(') depth++;
                    else if (ch === ')') {
                      depth--;
                      if (depth === 0) {
                        end = i;
                        break;
                      }
                    }
                  }
                  if (end === -1) return;
                  const call = raw.slice(parenStart + 1, end);
                  const code = `"use strict";\nconst electron = require("electron");\nconst { contextBridge, ipcRenderer } = electron;\ncontextBridge.exposeInMainWorld(${call});\n`;
                  writeFileSync(file, code, 'utf-8');
                } catch {
                  // 文件尚未生成时忽略
                }
              },
            },
          ],
        },
      },
    ]),
    renderer(),
  ],
})
